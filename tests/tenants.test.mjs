import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {authenticate,IdentityError,clearKeyCacheForTests} from '../lib/tenant-identity.mjs';
import {TenantWorkspace} from '../lib/tenant-workspace.mjs';
const b64=x=>Buffer.from(x).toString('base64url');
const secret=b64(crypto.getRandomValues(new Uint8Array(32)));
const encryption=b64(crypto.getRandomValues(new Uint8Array(32)));
const config={OPENCAREER_OIDC_ISSUER:'https://identity.example.com',OPENCAREER_OIDC_AUDIENCE:'open-career-dev',OPENCAREER_OIDC_JWKS_URL:'https://identity.example.com/.well-known/jwks.json',OPENCAREER_TENANT_SECRET:secret,OPENCAREER_CV_ENCRYPTION_KEY:encryption};
let keys,jwk;
before(async()=>{
 keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'oidc-test-key',alg:'RS256',use:'sig'};
 clearKeyCacheForTests();
});
const now=()=>Math.floor(Date.now()/1000);
async function token(sub,claims={},header={}){
 const h=b64(JSON.stringify({alg:'RS256',typ:'JWT',kid:'oidc-test-key',...header}));
 const p=b64(JSON.stringify({iss:config.OPENCAREER_OIDC_ISSUER,aud:config.OPENCAREER_OIDC_AUDIENCE,sub,iat:now(),exp:now()+3600,...claims}));
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+b64(new Uint8Array(signature));
}
const JWKS=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json'}});
async function principal(sub,claims={},header={}){const t=await token(sub,claims,header);return authenticate(new Request('https://career.example.com/api/v2/me',{headers:{Authorization:'Bearer '+t}}),config,{fetcher:JWKS});}
function storage(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const filename of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+filename,'utf8').replaceAll('--> statement-breakpoint',''));
 const DB={
  prepare(query){let vals=[];const bound={bind(...args){vals=args;return bound;},async first(){return sqlite.prepare(query).get(...vals)||null;},async all(){return {results:sqlite.prepare(query).all(...vals)};},async run(){const r=sqlite.prepare(query).run(...vals);return {meta:{changes:Number(r.changes)}};}};return bound;},
  async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}
 };
 class R2{
  constructor(){this.objects=new Map();}
  async put(k,bytes){this.objects.set(k,new Uint8Array(bytes));}
  async get(k){const data=this.objects.get(k);return data?{arrayBuffer:async()=>data.slice().buffer}:null;}
  async delete(k){this.objects.delete(k);}
 }
 const BUCKET=new R2();
 return {...config,DB,BUCKET,sqlite};
}
const profile=name=>({name,headline:'Early-career engineer',target_roles:['Graduate Engineer'],preferred_locations:['Remote'],languages:['English'],work_authorization:'Requires country-specific evaluation',evidence:[{id:'study',claim:'Completed an accredited undergraduate engineering programme.'}],custom_fields:{preferred_shift:'Day'}});
const cv=new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const job={provider:'greenhouse',board:'example',job_id:'123',title:'Graduate Engineer',apply_url:'https://boards.greenhouse.io/example/jobs/123'};
test('Signed OIDC tokens produce stable distinct tenant IDs and ignore forged identity headers',async()=>{
 const a=await principal('subject-A',{email:'a@example.com',email_verified:true,name:'Candidate A'}),b=await principal('subject-B');
 assert.match(a.tenantId,/^usr_[A-Za-z0-9_-]{43}$/);assert.notEqual(a.tenantId,b.tenantId);
 assert.equal(a.tenantId,(await principal('subject-A')).tenantId);
 const request=new Request('https://career.example.com',{headers:{authorization:'Bearer '+await token('subject-A'),'x-tenant-id':b.tenantId,'x-forwarded-user':'subject-B'}});
 assert.equal((await authenticate(request,config,{fetcher:JWKS})).tenantId,a.tenantId);
 assert.equal(a.email,'a@example.com');
});
test('Reject unsigned, expired, wrong-audience, wrong-issuer and tampered tokens',async()=>{
 await assert.rejects(authenticate(new Request('https://career.example.com'),config,{fetcher:JWKS}),IdentityError);
 await assert.rejects(principal('x',{aud:'other-client'}),/audience/);
 await assert.rejects(principal('x',{iss:'https://imposter.example.com'}),/issuer/);
 await assert.rejects(principal('x',{iat:now()-7200,exp:now()-3600}),/expired/);
 await assert.rejects(principal('x',{}, {alg:'none'}),/signature/);
 const t=await token('subject-A');const parts=t.split('.');
 const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString());payload.sub='subject-B';
 const altered=parts[0]+'.'+b64(JSON.stringify(payload))+'.'+parts[2];
 await assert.rejects(authenticate(new Request('https://career.example.com',{headers:{authorization:'Bearer '+altered}}),config,{fetcher:JWKS}),/signature/);
});
test('No workspace exists before explicit authenticated onboarding',async()=>{
 const env=storage(),workspace=new TenantWorkspace(env,await principal('candidate-a'));
 await assert.rejects(workspace.profile(),/not provisioned/);
 const r=await workspace.onboard();assert.equal(r.status,'active');
 assert.equal((await workspace.me()).id,workspace.id);
});
test('Two users cannot read or change each other\'s profiles, contacts, CV bytes or ATS applications',async()=>{
 const env=storage(),a=new TenantWorkspace(env,await principal('candidate-a')),b=new TenantWorkspace(env,await principal('candidate-b'));
 await a.onboard();await b.onboard();
 await a.setProfile(profile('Candidate Alpha'));await b.setProfile(profile('Candidate Beta'));
 assert.equal((await a.profile()).name,'Candidate Alpha');assert.equal((await b.profile()).name,'Candidate Beta');
 const c=await a.addContact({email:'person@example.com',name:'Contact A',company:'Example',role:'HR',source_url:'https://example.com/careers'});
 assert.equal(c.created,true);assert.equal(c.delivery_eligible,false);
 assert.equal((await b.contacts()).length,0);assert.equal((await a.contacts()).length,1);
 await b.addContact({email:'person@example.com',name:'Contact B'});
 assert.equal((await b.contacts())[0].name,'Contact B');
 await a.suppress('person@example.com');assert.equal((await a.contacts())[0].status,'suppressed');assert.equal((await b.contacts())[0].status,'unverified');
 const upload=await a.uploadCV(cv);
 assert.match(upload.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(Buffer.from((await a.readCV()).bytes),Buffer.from(cv));
 assert.equal(await b.cvInfo(),null);await assert.rejects(b.readCV(),/No CV uploaded/);
 assert.equal(env.BUCKET.objects.size,1);const encrypted=[...env.BUCKET.objects.values()][0];assert.notDeepEqual(Buffer.from(encrypted),Buffer.from(cv));
 assert.match([...env.BUCKET.objects.keys()][0],new RegExp('^tenants/'+a.id+'/cv/'));
 const tracked=await(await a.applications()).track(job);assert.equal(tracked.created,true);
 assert.equal((await(await b.applications()).list()).length,0);
 await assert.rejects((await b.applications()).prepare(tracked.application.id,{cv_sha256:upload.sha256,answers_sha256:'b'.repeat(64),form_sha256:'c'.repeat(64)}),/unavailable/);
 await assert.rejects(a.setProfile({...profile('Alpha'),tenant_id:b.id}),/Unsupported profile field/);
});
test('CV replacement is per user and checks document integrity',async()=>{
 const env=storage(),a=new TenantWorkspace(env,await principal('candidate-a')),b=new TenantWorkspace(env,await principal('candidate-b'));
 await a.onboard();await b.onboard();const first=await a.uploadCV(cv),second=await b.uploadCV(cv);
 assert.equal(first.sha256,second.sha256);assert.equal(env.BUCKET.objects.size,2);
 const replacement=new TextEncoder().encode('%PDF-1.5\n2 0 obj << /Type /Page >> endobj\n%%EOF\n');
 await a.uploadCV(replacement);assert.equal(env.BUCKET.objects.size,2);
 assert.deepEqual(Buffer.from((await b.readCV()).bytes),Buffer.from(cv));assert.deepEqual(Buffer.from((await a.readCV()).bytes),Buffer.from(replacement));
 await assert.rejects(a.uploadCV(new TextEncoder().encode('not a PDF')),/CV must be a PDF/);
 const aKey=[...env.BUCKET.objects.keys()].find(x=>x.includes(a.id));env.BUCKET.objects.get(aKey)[25]^=1;
 await assert.rejects(a.readCV(),/decrypt|operation|integrity/i);
});
test('Application preparation and approval require the correct tenant CV',async()=>{
 const env=storage(),a=new TenantWorkspace(env,await principal('candidate-a'));await a.onboard();const cvRecord=await a.uploadCV(cv);
 const tracked=await(await a.applications()).track(job),id=tracked.application.id;
 await assert.rejects((await a.applications()).approve(id,{cv_sha256:cvRecord.sha256,answers_sha256:'b'.repeat(64),form_sha256:'c'.repeat(64),consent:true}),/Approval refused/);
 await(await a.applications()).prepare(id,{cv_sha256:cvRecord.sha256,answers_sha256:'b'.repeat(64),form_sha256:'c'.repeat(64)});
 const approved=await(await a.applications()).approve(id,{cv_sha256:cvRecord.sha256,answers_sha256:'b'.repeat(64),form_sha256:'c'.repeat(64),consent:true});
 assert.equal(approved.status,'approved');
});
test('One user deletion leaves all other user data and CV untouched',async()=>{
 const env=storage(),a=new TenantWorkspace(env,await principal('candidate-a')),b=new TenantWorkspace(env,await principal('candidate-b'));
 await a.onboard();await b.onboard();
 await a.setProfile(profile('Candidate Alpha'));await b.setProfile(profile('Candidate Beta'));
 await a.uploadCV(cv);await b.uploadCV(cv);
 await a.addContact({email:'private@example.com'});await b.addContact({email:'private@example.com'});
 await(await a.applications()).track(job);await(await b.applications()).track(job);
 await assert.rejects(a.deleteAccount('no'),/Explicit/);
 assert.deepEqual(await a.deleteAccount('DELETE MY ACCOUNT'),{deleted:true});
 await assert.rejects(a.profile(),/not provisioned/);
 assert.equal((await b.profile()).name,'Candidate Beta');
 assert.equal((await b.contacts()).length,1);assert.equal((await(await b.applications()).list()).length,1);
 assert.deepEqual(Buffer.from((await b.readCV()).bytes),Buffer.from(cv));assert.equal(env.BUCKET.objects.size,1);
});
