// Bounded best-effort garbage collection of unreferenced CV ciphertext in ACTIVE accounts.
// Only object metadata older than 72 hours may be considered; current DB references
// are checked again immediately before deletion. Deleting accounts use tenant-purge.
const USER=/^usr_[A-Za-z0-9_-]{43}$/;
const AGE=72*60*60*1000;
const sql=(db,q,...args)=>db.prepare(q).bind(...args);
export async function sweepTenantOrphanCVs(env,tenantId,{now=()=>Date.now(),maxPages=2,maxDeletes=25}={}){
 if(!USER.test(tenantId)||!env?.DB?.prepare||!env.BUCKET?.list||!env.BUCKET?.delete)throw Error('Tenant sweep infrastructure unavailable');
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>4||!Number.isInteger(maxDeletes)||maxDeletes<1||maxDeletes>50)throw Error('Invalid maintenance batch size');
 const account=await sql(env.DB,"SELECT status FROM tenant_accounts WHERE id=?",tenantId).first();
 if(!account||account.status!=='active')return {skipped:true,scanned:0,deleted:0};
 const old=await sql(env.DB,'SELECT last_orphan_cursor FROM tenant_maintenance WHERE tenant_id=?',tenantId).first();
 const prefix='tenants/'+tenantId+'/cv/';
 const cutoff=now()-AGE;
 let cursor=old?.last_orphan_cursor||undefined,scanned=0,deleted=0,pages=0,restarted=false;
 const stale=[];
 try{
  while(pages++<maxPages){
   const page=await env.BUCKET.list({prefix,limit:100,...(cursor?{cursor}:{})});
   if(!page||!Array.isArray(page.objects))throw Error('R2 listing incomplete');
   for(const obj of page.objects){
    if(typeof obj.key!=='string'||!obj.key.startsWith(prefix))throw Error('R2 namespace violation');
    scanned++;
    const uploaded=new Date(obj.uploaded??'').getTime();
    // No reliable creation timestamp? Fail safe: do not delete this object.
    if(!Number.isFinite(uploaded)||uploaded>cutoff||deleted>=maxDeletes)continue;
    // The only active CV reference for the tenant is checked at deletion time.
    const current=await sql(env.DB,"SELECT storage_key FROM tenant_documents WHERE tenant_id=? AND kind='cv'",tenantId).first();
    if(current?.storage_key===obj.key)continue;
    // Prevent races against account removal: deleting accounts are handled separately.
    const active=await sql(env.DB,"SELECT 1 AS active FROM tenant_accounts WHERE id=? AND status='active'",tenantId).first();
    if(!active)return {skipped:true,scanned,deleted};
    await env.BUCKET.delete(obj.key);
    deleted++;stale.push(obj.key);
   }
   cursor=page.truncated?page.cursor:undefined;
   if(page.truncated&&(!cursor||typeof cursor!=='string'))throw Error('R2 listing cursor missing');
   if(!cursor)break;
  }
 }catch(error){
  // Bad or expired R2 cursors should not strand this account forever.
  if(old?.last_orphan_cursor&&!restarted){
   await sql(env.DB,"UPDATE tenant_maintenance SET last_orphan_cursor=NULL WHERE tenant_id=?",tenantId).run();
  }
  throw error;
 }
 const when=new Date(now()).toISOString();
 await sql(env.DB,`INSERT INTO tenant_maintenance(tenant_id,last_orphan_scan_at,last_orphan_cursor,last_orphan_deleted)
 VALUES(?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET last_orphan_scan_at=excluded.last_orphan_scan_at,last_orphan_cursor=excluded.last_orphan_cursor,last_orphan_deleted=tenant_maintenance.last_orphan_deleted+excluded.last_orphan_deleted`,
 tenantId,when,cursor||null,deleted).run();
 return {scanned,deleted,pages,complete:!cursor};
}
export async function runOrphanMaintenance(env,{now=()=>Date.now(),limit=2}={}){
 if(!env?.DB?.prepare||!env?.BUCKET?.list)throw Error('Orphan cleanup unavailable');
 if(!Number.isInteger(limit)||limit<1||limit>4)throw Error('Invalid sweep count');
 const users=(await sql(env.DB,`SELECT a.id FROM tenant_accounts a LEFT JOIN tenant_maintenance m ON m.tenant_id=a.id
 WHERE a.status='active' ORDER BY COALESCE(m.last_orphan_scan_at,'0000'),a.id LIMIT ?`,limit).all()).results;
 const result={selected:users.length,completed:0,failed:0,deleted:0};
 for(const u of users){
  try{const r=await sweepTenantOrphanCVs(env,u.id,{now});result.completed++;result.deleted+=r.deleted;}
  catch{result.failed++;}
 }
 return result;
}
// No content, tokens or user-supplied strings are emitted by maintenance logs.
