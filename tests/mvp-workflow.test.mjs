import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { MVPWorkflow } from '../lib/mvp-workflow.mjs';

class D1 {
 constructor(){
  this.db=new DatabaseSync(':memory:');
  this.db.exec(readFileSync('drizzle/0003_mvp_foundation.sql','utf8').replaceAll('--> statement-breakpoint',''));
 }
 prepare(sql) {
  let values=[];
  const db=this.db;
  const o={
   bind(...a){values=a;return o;},
   async first(){return db.prepare(sql).get(...values)||null;},
   async all(){return {results:db.prepare(sql).all(...values)};},
   async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};},
  };
  return o;
 }
 async batch(stmts){
  this.db.exec('BEGIN');
  try{const out=[];for(const s of stmts)out.push(await s.run());this.db.exec('COMMIT');return out;}
  catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
const cv='a'.repeat(64);
const scopes=['research:read','applications:prepare','applications:submit','records:write','accounts:create'];
const application={companyDomain:'electro.example',atsJobId:'J-01',vacancyUrl:'https://jobs.example/jobs/J-01',positionTitle:'Junior Electrical Engineer'};
async function ready(db=new D1(),id='person-1') {
 const x=new MVPWorkflow(db,id);
 await x.accept({agree:true,selectedScopes:scopes});
 return x;
}
test('explicit checkbox equivalent required; no implicit permissions',async()=>{
 const w=new MVPWorkflow(new D1(),'person-1');
 assert.equal((await w.status()).accepted,false);
 await assert.rejects(()=>w.accept({agree:false,selectedScopes:scopes}),/affirmatively/);
 await assert.rejects(()=>w.applications(),/Permission not granted/);
});
test('stored grants persist and can be individually revoked or revoked altogether',async()=>{
 const db=new D1(),a=await ready(db);
 assert.equal((await new MVPWorkflow(db,'person-1').permission('applications:submit')).open_career_granted,true);
 await a.revoke('applications:submit');
 assert.equal((await a.permission('applications:submit')).open_career_granted,false);
 await a.revoke('all');
 assert.equal((await a.status()).accepted,false);
 await assert.rejects(()=>a.prepare(application,cv),/Permission not granted/);
});
test('all records are owner-scoped, never shared across accounts',async()=>{
 const db=new D1(),a=await ready(db);
 await a.prepare(application,cv);
 const b=await ready(db,'person-2');
 assert.equal((await b.applications()).length,0);
 assert.equal((await a.applications()).length,1);
});
test('job reservation is idempotent and distinct for different job IDs',async()=>{
 const a=await ready();
 const x=await a.prepare(application,cv),y=await a.prepare(application,cv);
 assert.equal(x.created,true);
 assert.equal(y.duplicate,true);
 assert.equal(x.id,y.id);
 const z=await a.prepare({...application,atsJobId:'J-02'},cv);
 assert.notEqual(x.id,z.id);
 assert.equal((await a.applications()).length,2);
});
test('a stale CV causes a changed fingerprint flag, not a duplicate submission',async()=>{
 const a=await ready();
 await a.prepare(application,cv);
 const r=await a.prepare(application,'b'.repeat(64));
 assert.equal(r.cv_changed,true);
 assert.equal(r.duplicate,true);
});
test('agent cannot self-confirm and uncertain results block automatic reattempts',async()=>{
 const a=await ready();
 const {id}=await a.prepare(application,cv);
 await assert.rejects(()=>a.result({id,state:'confirmed'}),/Unsupported outcome/);
 await assert.rejects(()=>a.result({id,state:'submitted_unverified'}),/Submission blocked/);
 const attempt=await a.result({id,state:'attempted',evidence:{url:'https://jobs.example/jobs/J-01'}});
 assert.equal(attempt.verified,false);
 await a.result({id,state:'submitted_unverified',evidence:{message:'confirmation needs human check'}});
 await assert.rejects(()=>a.result({id,state:'attempted'}),/Submission blocked/);
 await assert.rejects(()=>a.result({id,state:'submitted_unverified'}),/Submission blocked/);
 const confirmed=await a.confirm({id,confirmationRef:'ABC1234'});
 assert.equal(confirmed.verification,'user_attested');
 await assert.rejects(()=>a.result({id,state:'attempted'}),/Submission blocked/);
});
test('missing relevant scopes block account creation and application execution',async()=>{
 const a=new MVPWorkflow(new D1(),'person-1');
 await a.accept({agree:true,selectedScopes:['research:read','applications:prepare']});
 const {id}=await a.prepare(application,cv);
 await assert.rejects(()=>a.result({id,state:'attempted'}),/Permission not granted/);
 await assert.rejects(()=>a.registerAccount({portalUrl:'https://jobs.example',loginEmail:'a@example.com'}),/Permission not granted/);
});
test('no plaintext passwords, passwords masquerading as generic credentials refused',async()=>{
 const a=await ready();
 await assert.rejects(()=>a.registerAccount({portalUrl:'https://jobs.example',loginEmail:'a@example.com',password:'secret'}),/never accepts passwords/);
 const r=await a.registerAccount({portalUrl:'https://jobs.example',loginEmail:'a@example.com'});
 assert.equal(r.passwordStored,false);
 assert.equal((await a.accounts()).length,1);
 assert.equal((await a.accounts())[0].login_email,'a@example.com');
});
test('URL, employer and profile fingerprint are validated',async()=>{
 const a=await ready();
 await assert.rejects(()=>a.prepare({...application,vacancyUrl:'http://jobs.example/job'},cv),/Public HTTPS/);
 await assert.rejects(()=>a.prepare({...application,companyDomain:'not_a_domain'},cv),/company domain/);
 await assert.rejects(()=>a.prepare(application,'invalid-cv'),/Verified PDF/);
});
test('external provider approval remains a separate unanswered question',async()=>{
 const a=await ready();
 const permission=await a.permission('applications:submit');
 assert.equal(permission.open_career_granted,true);
 assert.equal(permission.external_provider_permission,'unverified');
 assert.equal(permission.requires_host_authorization,true);
});
