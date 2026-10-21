// Internal, retryable account-deletion finalizer. This is never a user-addressable API.
// A deletion switches the account to 'deleting' FIRST, revoking browser sessions immediately.
const TENANT=/^usr_[A-Za-z0-9_-]{43}$/;
export class PurgeError extends Error{constructor(message){super(message);this.name='PurgeError';}}
function sql(db,query,...params){return db.prepare(query).bind(...params);}
async function objectsForTenant(bucket,tenantId,{maxObjects=100}={}){
 const prefix='tenants/'+tenantId+'/';
 if(typeof bucket?.list!=='function'||typeof bucket.delete!=='function')throw new PurgeError('Object storage listing and deletion required for safe purge');
 const keys=new Set();let cursor,passes=0;
 do{
  if(++passes>100)throw new PurgeError('Object listing exceeded maximum pages; retry later');
  const page=await bucket.list({prefix,limit:Math.min(100,maxObjects-keys.size),...(cursor?{cursor}:{})});
  if(!page||!Array.isArray(page.objects))throw new PurgeError('Invalid object storage listing');
  for(const obj of page.objects){
   const key=obj?.key;
   if(typeof key!=='string'||!key.startsWith(prefix))throw new PurgeError('Object ownership mismatch');
   keys.add(key);
   if(keys.size>maxObjects)throw new PurgeError('Object listing exceeded safe per-invocation limit');
  }
  cursor=page.truncated?page.cursor:null;
  if(page.truncated&&(!cursor||typeof cursor!=='string'))throw new PurgeError('Object listing cursor missing');
 }while(cursor&&keys.size<maxObjects);
 return keys;
}
export async function purgeDeletingTenant(env,tenantId,{maxObjects=100}={}){
 if(!TENANT.test(tenantId)||!env?.DB?.prepare||!env?.DB?.batch)throw new PurgeError('Invalid deletion context');
 const account=await sql(env.DB,'SELECT status FROM tenant_accounts WHERE id=?',tenantId).first();
 if(!account)return {already_deleted:true,purged_objects:0};
 if(account.status!=='deleting')throw new PurgeError('Account is not marked for deletion');
 const keys=await objectsForTenant(env.BUCKET,tenantId,{maxObjects});
 const docs=(await sql(env.DB,'SELECT storage_key FROM tenant_documents WHERE tenant_id=?',tenantId).all()).results;
 for(const doc of docs){
  if(typeof doc.storage_key!=='string'||!doc.storage_key.startsWith('tenants/'+tenantId+'/'))throw new PurgeError('Document ownership mismatch');
  if(keys.size<maxObjects)keys.add(doc.storage_key);
 }
 // Any remaining objects stay under the disabled tenant account and are retried later.
 for(const key of keys)await env.BUCKET.delete(key);
 // Never delete the tenant row until a fresh listing confirms there are no remaining objects.
 if((await objectsForTenant(env.BUCKET,tenantId,{maxObjects:1})).size)throw new PurgeError('More objects remain after bounded deletion; retry on next recovery run');
 const batch=[
  sql(env.DB,'DELETE FROM ats_applications WHERE tenant_id=?',tenantId),
  sql(env.DB,'DELETE FROM tenant_events WHERE tenant_id=?',tenantId),
  sql(env.DB,'DELETE FROM tenant_contacts WHERE tenant_id=?',tenantId),
  sql(env.DB,'DELETE FROM tenant_documents WHERE tenant_id=?',tenantId),
  sql(env.DB,'DELETE FROM tenant_profiles WHERE tenant_id=?',tenantId),
  sql(env.DB,"DELETE FROM tenant_accounts WHERE id=? AND status='deleting'",tenantId)
 ];
 await env.DB.batch(batch);
 return {already_deleted:false,purged_objects:keys.size};
}
export async function reconcileDeletingAccounts(env,{limit=3}={}){
 if(!Number.isInteger(limit)||limit<1||limit>10)throw new PurgeError('Invalid recovery batch size');
 if(!env?.DB?.prepare)throw new PurgeError('Database unavailable');
 const accounts=(await sql(env.DB,"SELECT id FROM tenant_accounts WHERE status='deleting' ORDER BY created_at ASC LIMIT ?",limit).all()).results;
 const summary={selected:accounts.length,completed:0,failed:0};
 for(const account of accounts){
  try{await purgeDeletingTenant(env,account.id);summary.completed++;}
  catch{summary.failed++;}
 }
 return summary;
}
