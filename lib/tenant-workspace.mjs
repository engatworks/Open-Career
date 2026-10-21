// Tenant-owned profile, CV and contact storage. Never construct from an unverified client tenant_id.
import {ApplicationLedger} from './application-ledger.mjs';
import {BoardWatch} from './board-watch.mjs';
import {purgeDeletingTenant} from './tenant-purge.mjs';
const stamp=()=>new Date().toISOString();
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID=/^usr_[A-Za-z0-9_-]{43}$/;
const MAX_CV=5_000_000;
const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const safe=(v,max=200)=>typeof v==='string'&&v.length<=max?v.trim():null;
function base64url(input){if(typeof input!=='string'||!/^[A-Za-z0-9_-]+$/.test(input))throw Error('Encryption key not configured');return Uint8Array.from(atob(input.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-input.length%4)%4)),x=>x.charCodeAt(0));}
function profileData(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Profile must be an object');
 const allowed=['name','headline','target_roles','preferred_locations','languages','work_authorization','evidence','custom_fields'];
 for(const k of Object.keys(value))if(!allowed.includes(k))throw Error('Unsupported profile field: '+k);
 const name=safe(value.name,120);if(!name||name.length<2)throw Error('Candidate name is required');
 const arr=(key,max)=>{if(value[key]===undefined)return [];if(!Array.isArray(value[key])||value[key].length>max)return null;return value[key].map(v=>safe(v,160));};
 const roles=arr('target_roles',30),locations=arr('preferred_locations',30),languages=arr('languages',30);
 if([roles,locations,languages].some(x=>!x||x.some(v=>v===null||!v)))throw Error('Invalid profile list');
 const headline=safe(value.headline??'',240),work=safe(value.work_authorization??'',1000);
 if(headline===null||work===null)throw Error('Invalid profile text');
 const evidence=value.evidence??[];
 if(!Array.isArray(evidence)||evidence.length>80)throw Error('Invalid candidate evidence');
 const cleanEvidence=evidence.map(e=>{if(!e||typeof e!=='object'||Object.keys(e).some(k=>!['id','claim'].includes(k)))throw Error('Invalid evidence item');const id=safe(e.id,80),claim=safe(e.claim,1000);if(!id||!claim||claim.length<5)throw Error('Invalid evidence claim');return {id,claim};});
 if(new Set(cleanEvidence.map(e=>e.id)).size!==cleanEvidence.length)throw Error('Evidence identifiers must be unique');
 const extra=value.custom_fields??{};
 if(!extra||typeof extra!=='object'||Array.isArray(extra)||Object.keys(extra).length>30)throw Error('Invalid profile custom fields');
 const custom={};for(const [k,v] of Object.entries(extra)){if(!/^[a-zA-Z][a-zA-Z0-9_ -]{0,59}$/.test(k)||safe(v,500)===null)throw Error('Invalid profile custom field');custom[k]=v.trim();}
 const result={name,headline,target_roles:roles,preferred_locations:locations,languages,work_authorization:work,evidence:cleanEvidence,custom_fields:custom};
 if(JSON.stringify(result).length>40000)throw Error('Profile exceeds storage limit');
 return result;
}
function checkEmail(value){const e=safe(value,200)?.toLowerCase();if(!e||!EMAIL.test(e))throw Error('Valid email required');return e;}
function requirePublicURL(value){if(value===undefined||value===null||value==='')return null;const v=safe(value,2000);if(!v)throw Error('Invalid source URL');let u;try{u=new URL(v);}catch{throw Error('Invalid source URL');}if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||u.hostname==='localhost'||u.hostname.endsWith('.local'))throw Error('Only public HTTPS source URLs allowed');return u.href;}
function contentKey(env){const bytes=base64url(env.OPENCAREER_CV_ENCRYPTION_KEY);if(bytes.length!==32)throw Error('CV encryption key must contain 32 bytes');return bytes;}
async function aesKey(env){return crypto.subtle.importKey('raw',contentKey(env),'AES-GCM',false,['encrypt','decrypt']);}
async function cvHash(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
async function encryptPDF(bytes,env){const nonce=crypto.getRandomValues(new Uint8Array(12));const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},await aesKey(env),bytes));const result=new Uint8Array(4+12+ciphertext.length);result.set(encoder.encode('OCV1'));result.set(nonce,4);result.set(ciphertext,16);return result;}
async function decryptPDF(bytes,env){const content=new Uint8Array(bytes);if(content.length<33||new TextDecoder().decode(content.subarray(0,4))!=='OCV1')throw Error('Stored CV has invalid encryption envelope');return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:content.slice(4,16)},await aesKey(env),content.slice(16)));}
function validatePDF(input){const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length<25||bytes.length>MAX_CV||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-'||!new TextDecoder().decode(bytes.slice(-Math.min(2048,bytes.length))).includes('%%EOF'))throw Error('CV must be a PDF of at most 5 MB');return bytes;}

export class TenantWorkspace{
 constructor(env,identity){
  if(!env?.DB?.prepare||!env?.BUCKET?.put||!identity||!ID.test(identity.tenantId))throw Error('Verified tenant identity and storage bindings required');
  this.env=env;this.db=env.DB;this.id=identity.tenantId;this.identity=identity;
 }
 sql(query,...values){return this.db.prepare(query).bind(...values);}
 async account({includeDeleting=false}={}){const row=await this.sql('SELECT * FROM tenant_accounts WHERE id=?',this.id).first();if(!row||row.status!=='active'&&!(includeDeleting&&row.status==='deleting'))throw Error('Account not provisioned or inactive');return row;}
 async onboard(){const id=this.id,at=stamp(),email=this.identity.email||null,display=this.identity.displayName||null;
  await this.sql("INSERT INTO tenant_accounts(id,email,display_name,status,created_at,last_seen_at) VALUES(?,?,?,'active',?,?) ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at,email=COALESCE(excluded.email,tenant_accounts.email),display_name=COALESCE(excluded.display_name,tenant_accounts.display_name) WHERE tenant_accounts.status='active'",id,email,display,at,at).run();
  return this.account();
 }
 async me(){return this.account();}
 async profile(){await this.account();const row=await this.sql('SELECT data,revision,updated_at FROM tenant_profiles WHERE tenant_id=?',this.id).first();return row?{...JSON.parse(row.data),revision:row.revision,updated_at:row.updated_at}:null;}
 async setProfile(input){await this.account();const value=profileData(input),at=stamp();await this.sql("INSERT INTO tenant_profiles(tenant_id,data,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(tenant_id) DO UPDATE SET data=excluded.data,revision=tenant_profiles.revision+1,updated_at=excluded.updated_at WHERE EXISTS(SELECT 1 FROM tenant_accounts WHERE id=? AND status='active')",this.id,JSON.stringify(value),at,this.id).run();await this.event('profile_saved',{});return this.profile();}
 async cvInfo(){await this.account();const r=await this.sql("SELECT kind,sha256,byte_length,created_at FROM tenant_documents WHERE tenant_id=? AND kind='cv'",this.id).first();return r||null;}
 async uploadCV(input){
  await this.account();
  const bytes=validatePDF(input),hash=await cvHash(bytes),encrypted=await encryptPDF(bytes,this.env);
  const prefix='tenants/'+this.id+'/cv/',key=prefix+crypto.randomUUID()+'.ocv';
  const existing=await this.sql("SELECT storage_key FROM tenant_documents WHERE tenant_id=? AND kind='cv'",this.id).first();
  if(existing?.storage_key&&!existing.storage_key.startsWith(prefix))throw Error('CV ownership mismatch');
  await this.env.BUCKET.put(key,encrypted,{httpMetadata:{contentType:'application/octet-stream'}});
  try{
   const created=stamp();
   let result;
   if(existing){
    // Compare-and-swap: concurrent replacements must NOT silently overwrite each other.
    result=await this.sql("UPDATE tenant_documents SET storage_key=?,sha256=?,byte_length=?,created_at=? WHERE tenant_id=? AND kind='cv' AND storage_key=? AND EXISTS(SELECT 1 FROM tenant_accounts WHERE id=? AND status='active')",key,hash,bytes.length,created,this.id,existing.storage_key,this.id).run();
   }else{
    result=await this.sql("INSERT INTO tenant_documents(tenant_id,kind,storage_key,sha256,byte_length,created_at) SELECT ?,'cv',?,?,?,? WHERE EXISTS(SELECT 1 FROM tenant_accounts WHERE id=? AND status='active') ON CONFLICT(tenant_id,kind) DO NOTHING",this.id,key,hash,bytes.length,created,this.id).run();
   }
   if(result.meta.changes!==1)throw Error('CV was changed concurrently or account is inactive. Reload and retry.');
  }catch(error){await this.env.BUCKET.delete(key).catch(()=>{});throw error;}
  // Cleanup is best effort AFTER the CAS succeeds. On account deletion the R2 namespace
  // purge will find all abandoned older revisions, even if a previous cleanup failed.
  if(existing?.storage_key)await this.env.BUCKET.delete(existing.storage_key).catch(()=>{});
  await this.event('cv_saved',{sha256:hash,size:bytes.length});
  return {sha256:hash,byte_length:bytes.length};
 }
 async readCV(){await this.account();const row=await this.sql("SELECT storage_key,sha256,byte_length FROM tenant_documents WHERE tenant_id=? AND kind='cv'",this.id).first();if(!row)throw Error('No CV uploaded');if(!row.storage_key.startsWith('tenants/'+this.id+'/cv/'))throw Error('CV ownership mismatch');
  const object=await this.env.BUCKET.get(row.storage_key);if(!object)throw Error('CV object missing');const bytes=await decryptPDF(await object.arrayBuffer(),this.env);
  if(bytes.length!==row.byte_length||await cvHash(bytes)!==row.sha256)throw Error('CV integrity check failed');
  return {bytes,sha256:row.sha256};
 }
 async deleteCV(){
  await this.account();
  const row=await this.sql("SELECT storage_key FROM tenant_documents WHERE tenant_id=? AND kind='cv'",this.id).first();
  if(!row)return {deleted:true};
  if(!row.storage_key.startsWith('tenants/'+this.id+'/cv/'))throw Error('CV ownership mismatch');
  const result=await this.sql("DELETE FROM tenant_documents WHERE tenant_id=? AND kind='cv' AND storage_key=?",this.id,row.storage_key).run();
  if(result.meta.changes!==1)throw Error('CV changed concurrently. Reload and retry.');
  // Metadata is removed before object deletion. The object is not returned again; if R2
  // deletion fails, tenant namespace reconciliation at account removal still finds it.
  await this.env.BUCKET.delete(row.storage_key);
  await this.event('cv_deleted',{});
  return {deleted:true};
 }
 async addContact(input){await this.account();if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['email','name','company','role','source_url'].includes(k)))throw Error('Invalid contact fields');
  const email=checkEmail(input.email),name=safe(input.name??'',160),company=safe(input.company??'',200),role=safe(input.role??'',200),source=requirePublicURL(input.source_url);
  if([name,company,role].some(x=>x===null))throw Error('Invalid contact information');
  const id=crypto.randomUUID(),at=stamp();
  const r=await this.sql("INSERT INTO tenant_contacts(id,tenant_id,email,name,company,role,source_url,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'unverified',?,? WHERE EXISTS(SELECT 1 FROM tenant_accounts WHERE id=? AND status='active') ON CONFLICT(tenant_id,email) DO NOTHING",id,this.id,email,name,company,role,source,at,at,this.id).run();
  const row=await this.sql('SELECT * FROM tenant_contacts WHERE tenant_id=? AND email=?',this.id,email).first();
  return {contact:row,created:r.meta.changes===1,delivery_eligible:false};
 }
 async contacts(){await this.account();return (await this.sql('SELECT * FROM tenant_contacts WHERE tenant_id=? ORDER BY created_at DESC LIMIT 500',this.id).all()).results;}
 async suppress(email){await this.account();const v=checkEmail(email),at=stamp();const r=await this.sql("UPDATE tenant_contacts SET status='suppressed',updated_at=? WHERE tenant_id=? AND email=?",at,this.id,v).run();return {suppressed:r.meta.changes===1};}
 async applications(){await this.account();return new ApplicationLedger(this.db,this.id);}
 async event(kind,detail){await this.sql('INSERT INTO tenant_events(tenant_id,at,kind,detail) VALUES(?,?,?,?)',this.id,stamp(),kind,JSON.stringify(detail)).run();}
 async exportData(){await this.account();return {account:await this.me(),profile:await this.profile(),cv:await this.cvInfo(),contacts:await this.contacts(),applications:await(await this.applications()).list(),employer_boards:await(new BoardWatch(this.db,this.id)).boards(),observed_jobs:await(new BoardWatch(this.db,this.id)).listings({limit:300}),events:(await this.sql('SELECT at,kind,detail FROM tenant_events WHERE tenant_id=? ORDER BY id DESC LIMIT 2000',this.id).all()).results,notice:'CV PDF is downloaded separately; no identity tokens or encrypted CV bytes are exported here.'};}
 async deleteAccount(confirmation){
  if(confirmation!=='DELETE MY ACCOUNT')throw Error('Explicit account deletion confirmation required');
  await this.account({includeDeleting:true});
  // Account enters an irreversible fail-closed state before any external R2 call.
  await this.sql("UPDATE tenant_accounts SET status='deleting' WHERE id=? AND status IN ('active','deleting')",this.id).run();
  // If R2 or D1 fails, the internal janitor retries. Browser sessions are denied while
  // 'deleting', and the owner cannot accidentally reactivate this identity.
  return {deleted:true,...await purgeDeletingTenant(this.env,this.id)};
 }
}
