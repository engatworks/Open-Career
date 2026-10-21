// Tenant-owned profile, CV and contact storage. Never construct from an unverified client tenant_id.
import {ApplicationLedger} from './application-ledger.mjs';
import {BoardWatch} from './board-watch.mjs';
import {purgeDeletingTenant} from './tenant-purge.mjs';
import {encryptCV,decryptCV,encryptedCVKeyId,activeCVKeyId} from './cv-crypto.mjs';
const stamp=()=>new Date().toISOString();
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID=/^usr_[A-Za-z0-9_-]{43}$/;
const MAX_CV=5_000_000;
const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const safe=(v,max=200)=>typeof v==='string'&&v.length<=max?v.trim():null;
async function cvHash(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
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
 async setProfile(input){
  await this.account();
  const expectedRevision=input?.expected_revision??0;
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('A valid profile revision is required');
  const value=profileData(input),at=stamp();
  // Revision=0 is creation only; every later update needs the exact revision read
  // previously. This prevents silent lost updates from multiple browser tabs or agents.
  // Separate SQL statements are required: INSERT ... SELECT producing zero rows cannot
  // execute the ON CONFLICT update for an existing profile.
  const result=expectedRevision===0
   ?await this.sql("INSERT INTO tenant_profiles(tenant_id,data,revision,updated_at) SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM tenant_accounts WHERE id=? AND status='active') ON CONFLICT(tenant_id) DO NOTHING",this.id,JSON.stringify(value),at,this.id).run()
   :await this.sql("UPDATE tenant_profiles SET data=?,revision=revision+1,updated_at=? WHERE tenant_id=? AND revision=? AND EXISTS(SELECT 1 FROM tenant_accounts WHERE id=? AND status='active')",JSON.stringify(value),at,this.id,expectedRevision,this.id).run();
  if(result.meta.changes!==1)throw Error('Profile changed in another session. Reload and merge your changes.');
  await this.event('profile_saved',{});
  return this.profile();
 }
 async cvInfo(){await this.account();const r=await this.sql("SELECT kind,sha256,byte_length,created_at FROM tenant_documents WHERE tenant_id=? AND kind='cv'",this.id).first();return r||null;}
 async uploadCV(input){
  await this.account();
  const bytes=validatePDF(input),hash=await cvHash(bytes),encrypted=await encryptCV(bytes,this.env,this.id);
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
  const object=await this.env.BUCKET.get(row.storage_key);if(!object)throw Error('CV object missing');const bytes=await decryptCV(await object.arrayBuffer(),this.env,this.id);
  if(bytes.length!==row.byte_length||await cvHash(bytes)!==row.sha256)throw Error('CV integrity check failed');
  return {bytes,sha256:row.sha256};
 }
 async rotateCVKey(){
  await this.account();
  const active=activeCVKeyId(this.env);
  if(!active)throw Error('CV key rotation requires a configured versioned keyring');
  const row=await this.sql("SELECT storage_key,sha256,byte_length FROM tenant_documents WHERE tenant_id=? AND kind='cv'",this.id).first();
  if(!row)return {rotated:false,reason:'no_cv'};
  const prefix='tenants/'+this.id+'/cv/';
  if(!row.storage_key.startsWith(prefix))throw Error('CV ownership mismatch');
  const obj=await this.env.BUCKET.get(row.storage_key);
  if(!obj)throw Error('CV object missing');
  const stored=new Uint8Array(await obj.arrayBuffer());
  if(encryptedCVKeyId(stored)===active)return {rotated:false,reason:'already_current',key_id:active};
  const bytes=await decryptCV(stored,this.env,this.id);
  if(bytes.length!==row.byte_length||await cvHash(bytes)!==row.sha256)throw Error('CV integrity check failed');
  const newKey=prefix+crypto.randomUUID()+'.ocv';
  await this.env.BUCKET.put(newKey,await encryptCV(bytes,this.env,this.id),{httpMetadata:{contentType:'application/octet-stream'}});
  try{
   const result=await this.sql("UPDATE tenant_documents SET storage_key=? WHERE tenant_id=? AND kind='cv' AND storage_key=? AND EXISTS (SELECT 1 FROM tenant_accounts WHERE id=? AND status='active')",newKey,this.id,row.storage_key,this.id).run();
   if(result.meta.changes!==1)throw Error('CV changed concurrently. Reload and retry.');
  }catch(error){await this.env.BUCKET.delete(newKey).catch(()=>{});throw error;}
  await this.env.BUCKET.delete(row.storage_key).catch(()=>{});
  await this.event('cv_key_rotated',{key_id:active});
  return {rotated:true,key_id:active};
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
