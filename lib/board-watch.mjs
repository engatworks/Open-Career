// Source-backed, tenant-specific employer job boards and new-listing detection.
// No guessed employer affiliations, no applications, no cross-tenant reads, no automatic submission.
import {atsSource,discoverATSJobs} from './ats-discovery.mjs';
const ID=/^usr_[A-Za-z0-9_-]{43}$/;
const now=()=>new Date().toISOString();
function clean(value,max=160){return typeof value==='string'&&value.trim().length<=max?value.trim():null;}
const safeError=e=>e instanceof Error?e.message.slice(0,300):'ATS source failed';
export class BoardWatch {
 constructor(db,tenantId,{discover=discoverATSJobs,clock=now}={}){
  if(!db?.prepare||!ID.test(tenantId))throw Error('Trusted tenant and database required');
  this.db=db;this.tenantId=tenantId;this.discover=discover;this.clock=clock;
 }
 query(sql,...params){return this.db.prepare(sql).bind(...params);}
 async boards(){
  const result=await this.query(`SELECT b.*,(
   SELECT COUNT(*) FROM tenant_job_sightings s WHERE s.tenant_id=b.tenant_id AND s.board_id=b.id AND s.status='new'
  ) AS new_count FROM tenant_boards b WHERE b.tenant_id=? ORDER BY b.created_at DESC LIMIT 30`,this.tenantId).all();
  return result.results;
 }
 async save({provider,board,region='global',label}={}){
  const src=atsSource({provider,board,region});
  const title=clean(label,160);if(!title||title.length<2)throw Error('Employer label required');
  const id=crypto.randomUUID(),at=this.clock();
  const result=await this.query(`INSERT INTO tenant_boards(id,tenant_id,provider,board,region,label,source_url,created_at)
   SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM tenant_boards WHERE tenant_id=?)<25
   ON CONFLICT(tenant_id,provider,board,region) DO NOTHING`,id,this.tenantId,provider,board,region,title,src.url,at,this.tenantId).run();
  const found=await this.query('SELECT * FROM tenant_boards WHERE tenant_id=? AND provider=? AND board=? AND region=?',this.tenantId,provider,board,region).first();
  if(!found)throw Error('Your board watchlist is full (maximum 25).');
  return {board:found,created:result.meta.changes===1,notice:'Board slug and employer association are user-supplied; verify the employer on the official careers page.'};
 }
 async remove(id){
  const r=await this.query('DELETE FROM tenant_boards WHERE tenant_id=? AND id=?',this.tenantId,id).run();
  if(r.meta.changes!==1)throw Error('Board not found in your workspace');
  return {removed:true};
 }
 async listings({status=null,limit=100}={}){
  if(status!==null&&!['new','seen','known'].includes(status))throw Error('Invalid listing status');
  if(!Number.isInteger(limit)||limit<1||limit>300)throw Error('Invalid listing limit');
  const stmt=status===null?'SELECT * FROM tenant_job_sightings WHERE tenant_id=? ORDER BY first_seen_at DESC LIMIT ?':
   'SELECT * FROM tenant_job_sightings WHERE tenant_id=? AND status=? ORDER BY first_seen_at DESC LIMIT ?';
  const values=status===null?[this.tenantId,limit]:[this.tenantId,status,limit];
  return (await this.query(stmt,...values).all()).results;
 }
 async markSeen(jobKey){
  if(typeof jobKey!=='string'||jobKey.length>310||!jobKey)throw Error('Invalid job identifier');
  const result=await this.query("UPDATE tenant_job_sightings SET status='seen' WHERE tenant_id=? AND job_key=? AND status='new'",this.tenantId,jobKey).run();
  return {updated:result.meta.changes===1};
 }
 async scan(id){
  if(typeof id!=='string'||id.length>128)throw Error('Invalid board identifier');
  const b=await this.query('SELECT * FROM tenant_boards WHERE tenant_id=? AND id=?',this.tenantId,id).first();
  if(!b)throw Error('Board not found in your workspace');
  const at=this.clock(),previous=Date.parse(b.last_attempt_at||'');
  if(Number.isFinite(previous)&&Date.parse(at)-previous<600000)throw Error('Board was checked recently. Retry after 10 minutes.');
  // Atomic lease: concurrent double-scans of the same board cannot race on first sightings.
  const lease=await this.query(`UPDATE tenant_boards SET last_attempt_at=?,last_error=NULL
   WHERE tenant_id=? AND id=? AND (last_attempt_at IS NULL OR last_attempt_at<?)`,at,this.tenantId,id,new Date(Date.parse(at)-600000).toISOString()).run();
  if(lease.meta.changes!==1)throw Error('Board check already in progress or recently attempted');
  try{
   const result=await this.discover({provider:b.provider,board:b.board,region:b.region,limit:100});
   if(!Array.isArray(result.jobs)||result.jobs.length>100)throw Error('Unexpected ATS result');
   const baseline=b.last_success_at===null;
   const keys=result.jobs.map(j=>j.job_key);
   const found=new Set();
   if(keys.length){
    const placeholders=keys.map(()=>'?').join(',');
    const rows=await this.query(`SELECT job_key FROM tenant_job_sightings WHERE tenant_id=? AND job_key IN (${placeholders})`,this.tenantId,...keys).all();
    for(const row of rows.results)found.add(row.job_key);
   }
   const jobs=result.jobs;
   const statements=[];
   let newCount=0,seen=0;
   for(const j of jobs){
    if(!j.job_key?.startsWith(b.provider+':'+b.board+':'))throw Error('Provider returned an invalid listing key');
    const fresh=!found.has(j.job_key);
    if(fresh&&!baseline)newCount++;
    if(!fresh)seen++;
    statements.push(this.query(`INSERT INTO tenant_job_sightings(tenant_id,board_id,job_key,title,location,apply_url,first_seen_at,last_seen_at,status)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(tenant_id,job_key) DO UPDATE SET
      title=excluded.title,location=excluded.location,apply_url=excluded.apply_url,last_seen_at=excluded.last_seen_at`,
     this.tenantId,id,j.job_key,clean(j.title,300)||'',clean(j.location,300)||'',j.apply_url,at,at,baseline?'known':'new'));
   }
   if(statements.length)await this.db.batch(statements);
   await this.query('UPDATE tenant_boards SET last_success_at=?,last_error=NULL WHERE tenant_id=? AND id=?',at,this.tenantId,id).run();
   return {board_id:id,checked_at:at,baseline,found:jobs.length,previously_seen:seen,newly_detected:newCount,notice:baseline?'Initial scan establishes a baseline; no job alerts were inferred.':'Only newly observed public listings are flagged. Eligibility and availability require review.'};
  }catch(e){
   await this.query('UPDATE tenant_boards SET last_error=? WHERE tenant_id=? AND id=?',safeError(e),this.tenantId,id).run().catch(()=>{});
   throw e;
  }
 }
}
