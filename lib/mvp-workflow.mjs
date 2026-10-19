import { TERMS_VERSION, SCOPES, checkActionGrant, applicationIdempotencyKey } from './mvp-consent.mjs';
const clock=()=>new Date().toISOString();
const clean=(x,n=200)=>typeof x==='string'?x.trim().slice(0,n):'';
const scopes=new Set(SCOPES);
const states=new Set(['attempted','submitted_unverified','requires_user','failed']);
export const MVP_TERMS_TEXT=[
 'Open Career assists employment research and applications. It is not an employer, recruiter, immigration advisor or guarantee of employment.',
 'You are responsible for accurate application details and should review important legal eligibility questions.',
 'You may separately authorize employer emails, replies, account creation, applications and records. Actions can be autonomous only where host and external service permit.',
 'You may revoke authorizations. Hosts may still request approval. Do not bypass platform restrictions or security challenges.',
 'Application details can be private. The MVP does not store passwords. Liability is limited only to the extent permitted by applicable law.',
].join('\n');
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const checkedId=id=>{if(typeof id!=='string'||!id.trim()||id.length>200)throw Error('Authenticated user required');return id;};
function publicUrl(value) {
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||/^\d/.test(u.hostname)||/(^|\.)localhost$|(^|\.)internal$/i.test(u.hostname))throw Error('Public HTTPS address required');
 return u;
}
function domain(value) {
 const s=clean(value,180).toLowerCase().replace(/^www\./,'');
 if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(s))throw Error('Invalid company domain');
 return s;
}
export class MVPWorkflow {
 constructor(db,accountId){if(!db?.prepare)throw Error('Database unavailable');this.db=db;this.accountId=checkedId(accountId);}
 stmt(sql,...args){return this.db.prepare(sql).bind(...args);}
 async grant(){
  const a=await this.stmt('SELECT * FROM mvp_acceptances WHERE account_id=?',this.accountId).first();
  const r=(await this.stmt('SELECT scope FROM mvp_grants WHERE account_id=? AND revoked_at IS NULL',this.accountId).all()).results||[];
  return {accountId:this.accountId,termsAccepted:!!a&&!a.revoked_at&&a.terms_hash===await sha(MVP_TERMS_TEXT),termsVersion:a?.terms_version,acceptedAt:a?.accepted_at,revokedAt:a?.revoked_at,scopes:r.map(x=>x.scope)};
 }
 async status(){const g=await this.grant();return {termsVersion:TERMS_VERSION,termsText:MVP_TERMS_TEXT,termsHash:await sha(MVP_TERMS_TEXT),accepted:g.termsAccepted&&g.termsVersion===TERMS_VERSION,scopes:g.scopes,acceptedAt:g.acceptedAt||null};}
 async assert(scope){const v=checkActionGrant({grant:await this.grant(),accountId:this.accountId,scope,providerAllowsAction:true});if(!v.allowed)throw Error('Permission not granted: '+v.reason);return true;}
 async permission(scope){if(!scopes.has(scope))throw Error('Unknown scope');const g=await this.grant();const v=checkActionGrant({grant:g,accountId:this.accountId,scope,providerAllowsAction:true});return {scope,open_career_granted:v.allowed,external_provider_permission:'unverified',requires_host_authorization:true,reason:v.reason};}
 async accept({agree,selectedScopes}={}){
  if(agree!==true||!Array.isArray(selectedScopes)||!selectedScopes.length||selectedScopes.length>SCOPES.length||selectedScopes.some(s=>!scopes.has(s))||new Set(selectedScopes).size!==selectedScopes.length)throw Error('Select permissions and affirmatively accept terms');
  const t=clock(),h=await sha(MVP_TERMS_TEXT);
  await this.db.batch([
   this.stmt('INSERT INTO mvp_acceptances(account_id,terms_version,terms_hash,accepted_at,revoked_at) VALUES(?,?,?,?,NULL) ON CONFLICT(account_id) DO UPDATE SET terms_version=excluded.terms_version,terms_hash=excluded.terms_hash,accepted_at=excluded.accepted_at,revoked_at=NULL',this.accountId,TERMS_VERSION,h,t),
   this.stmt('DELETE FROM mvp_grants WHERE account_id=?',this.accountId),
   ...selectedScopes.map(s=>this.stmt('INSERT INTO mvp_grants(account_id,scope,granted_at,revoked_at) VALUES(?,?,?,NULL)',this.accountId,s,t)),
  ]);return this.status();
 }
 async revoke(scope) {
  if(scope==='all')await this.db.batch([
   this.stmt('UPDATE mvp_acceptances SET revoked_at=? WHERE account_id=?',clock(),this.accountId),
   this.stmt('UPDATE mvp_grants SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL',clock(),this.accountId)]);
  else {if(!scopes.has(scope))throw Error('Unknown scope');await this.stmt('UPDATE mvp_grants SET revoked_at=? WHERE account_id=? AND scope=?',clock(),this.accountId,scope).run();}
  return this.status();
 }
 async applications(){
  await this.assert('research:read');
  return (await this.stmt('SELECT id,company_domain,ats_job_id,vacancy_url,position_title,state,cv_hash,evidence,created_at,updated_at FROM mvp_applications WHERE account_id=? ORDER BY updated_at DESC LIMIT 300',this.accountId).all()).results;
 }
 async prepare(input={},cvHash=''){
  await this.assert('applications:prepare');
  if(!/^[a-f0-9]{64}$/.test(cvHash))throw Error('Verified PDF CV required');
  const company=domain(input.companyDomain),url=publicUrl(input.vacancyUrl).href,jobId=clean(input.atsJobId,160),title=clean(input.positionTitle,180);
  if(title.length<3)throw Error('Job title required');
  const key=applicationIdempotencyKey({accountId:this.accountId,companyDomain:company,atsJobId:jobId,vacancyUrl:url});
  const id=await sha(key),at=clock();
  const result=await this.stmt("INSERT OR IGNORE INTO mvp_applications(id,account_id,company_domain,ats_job_id,vacancy_url,position_title,state,cv_hash,evidence,created_at,updated_at) VALUES(?,?,?,?,?,?,'prepared',?,'{}',?,?)",id,this.accountId,company,jobId,url,title,cvHash,at,at).run();
  const row=await this.stmt('SELECT * FROM mvp_applications WHERE id=? AND account_id=?',id,this.accountId).first();
  return {id,state:row.state,created:!!result.meta?.changes,duplicate:!result.meta?.changes,cv_changed:row.cv_hash!==cvHash};
 }
 async result({id,state,evidence}={}){
  if(!states.has(state))throw Error('Unsupported outcome; confirmation requires separate human verification');
  await this.assert(state==='attempted'||state==='submitted_unverified'?'applications:submit':'records:write');
  const row=await this.stmt('SELECT * FROM mvp_applications WHERE id=? AND account_id=?',clean(id,64),this.accountId).first();
  if(!row)throw Error('Application not found');
  const transitions={
   prepared:['attempted','requires_user','failed'],
   attempted:['submitted_unverified','requires_user','failed'],
   requires_user:[],
   submitted_unverified:[],
   confirmed:[],
   failed:[],
  };
  if(!(transitions[row.state]||[]).includes(state))throw Error('Submission blocked: terminal, ambiguous or invalid state. Do not automatically retry');
  if(evidence&&(typeof evidence!=='object'||Array.isArray(evidence)||JSON.stringify(evidence).length>2000))throw Error('Evidence object invalid');
  await this.stmt('UPDATE mvp_applications SET state=?,evidence=?,updated_at=? WHERE id=? AND account_id=?',state,JSON.stringify({source:'agent_report',...(evidence||{})}),clock(),id,this.accountId).run();
  return {id,state,verified:false};
 }
 async confirm({id,confirmationRef}={}){
  await this.assert('records:write');
  const ref=clean(confirmationRef,180);
  if(ref.length<4)throw Error('Applicant confirmation reference required');
  const row=await this.stmt('SELECT * FROM mvp_applications WHERE id=? AND account_id=?',clean(id,64),this.accountId).first();
  if(!row||!['attempted','submitted_unverified'].includes(row.state))throw Error('Nothing to confirm');
  await this.stmt("UPDATE mvp_applications SET state='confirmed',evidence=?,updated_at=? WHERE id=? AND account_id=?",JSON.stringify({source:'user_attestation',confirmationRef:ref}),clock(),id,this.accountId).run();
  return {id,state:'confirmed',verification:'user_attested'};
 }
 async registerAccount({portalUrl,loginEmail,password}={}){
  await this.assert('accounts:create');
  if(password!==undefined)throw Error('MVP never accepts passwords; use your password manager');
  const host=publicUrl(portalUrl).hostname.toLowerCase(),email=clean(loginEmail,320).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Valid email required');
  const id=await sha(this.accountId+'|'+host+'|'+email),t=clock();
  await this.stmt('INSERT OR IGNORE INTO mvp_portal_accounts(id,account_id,site_host,login_email,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,this.accountId,host,email,t,t).run();
  return {id,host,loginEmail:email,passwordStored:false};
 }
 async accounts(){
  await this.assert('research:read');
  return (await this.stmt('SELECT id,site_host,login_email,created_at,updated_at FROM mvp_portal_accounts WHERE account_id=? ORDER BY updated_at DESC LIMIT 200',this.accountId).all()).results;
 }
}
