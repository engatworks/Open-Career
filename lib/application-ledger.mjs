// Tenant-isolated ATS application state machine. NOT exposed to untrusted HTTP/MCP callers.
// Construct only after validating a platform-signed, server-side tenant identity.
const validId=/^[a-zA-Z0-9_-]{8,128}$/;
const sha=/^[a-f0-9]{64}$/;
const iso=()=>new Date().toISOString();
function assertId(value,label){if(typeof value!=='string'||!validId.test(value))throw Error('Invalid '+label);return value;}
function assertSha(value,label){if(typeof value!=='string'||!sha.test(value))throw Error('Invalid '+label);return value;}
function safeString(value,label,max=500){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Invalid '+label);return value.trim();}
function jobKey(job){if(!['greenhouse','lever','ashby'].includes(job.provider))throw Error('Unsupported ATS');if(typeof job.board!=='string'||!/^[\w-]{1,100}$/.test(job.board))throw Error('Invalid board');return `${job.provider}:${job.board}:${safeString(job.job_id,'job ID',150)}`;}
export class ApplicationLedger{
 constructor(db,tenantId){if(!db?.prepare)throw Error('Database required');this.db=db;this.tenantId=assertId(tenantId,'trusted tenant ID');}
 sql(query,...values){return this.db.prepare(query).bind(...values);}
 async get(id){assertId(id,'application ID');const row=await this.sql('SELECT * FROM ats_applications WHERE tenant_id=? AND id=?',this.tenantId,id).first();return row||null;}
 async list(){return (await this.sql('SELECT * FROM ats_applications WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100',this.tenantId).all()).results;}
 async track(job){const key=jobKey(job),title=safeString(job.title,'job title',300),link=safeString(job.apply_url,'application URL',2000);
  const u=new URL(link);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!u.hostname.includes('.')||/^(?:localhost|\\d|\\[)/i.test(u.hostname)||/\\.(?:local|internal|localhost)$/i.test(u.hostname))throw Error('Application URL must be a public HTTPS URL');
  const id=crypto.randomUUID(),stamp=iso();
  const result=await this.sql("INSERT INTO ats_applications(id,tenant_id,job_key,provider,board,job_id,title,apply_url,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'discovered',?,?) ON CONFLICT(tenant_id,job_key) DO NOTHING",id,this.tenantId,key,job.provider,job.board,String(job.job_id),title,link,stamp,stamp).run();
  const row=await this.sql('SELECT * FROM ats_applications WHERE tenant_id=? AND job_key=?',this.tenantId,key).first();return {application:row,created:result.meta.changes===1};
 }
 async prepare(id,{cv_sha256,answers_sha256,form_sha256}){assertSha(cv_sha256,'CV fingerprint');assertSha(answers_sha256,'answers fingerprint');assertSha(form_sha256,'form fingerprint');const stamp=iso();
  const r=await this.sql("UPDATE ats_applications SET status='prepared',cv_sha256=?,answers_sha256=?,form_sha256=?,approval_at=NULL,updated_at=? WHERE tenant_id=? AND id=? AND status='discovered'",cv_sha256,answers_sha256,form_sha256,stamp,this.tenantId,assertId(id,'application ID')).run();
  if(r.meta.changes!==1)throw Error('Application unavailable or not discoverable');return this.get(id);
 }
 async approve(id,{cv_sha256,answers_sha256,form_sha256,consent}){if(consent!==true)throw Error('Explicit user approval is required');[cv_sha256,answers_sha256,form_sha256].forEach((s,i)=>assertSha(s,['CV','answers','form'][i]+' fingerprint'));const stamp=iso();
  const r=await this.sql("UPDATE ats_applications SET status='approved',approval_at=?,updated_at=? WHERE tenant_id=? AND id=? AND status='prepared' AND cv_sha256=? AND answers_sha256=? AND form_sha256=?",stamp,stamp,this.tenantId,assertId(id,'application ID'),cv_sha256,answers_sha256,form_sha256).run();
  if(r.meta.changes!==1)throw Error('Approval refused: missing record, wrong state or altered application');return this.get(id);
 }
 async beginSubmission(id){const token=crypto.randomUUID(),stamp=iso();const r=await this.sql("UPDATE ats_applications SET status='submitting',attempt_token=?,attempted_at=?,updated_at=? WHERE tenant_id=? AND id=? AND status='approved'",token,stamp,stamp,this.tenantId,assertId(id,'application ID')).run();
  if(r.meta.changes!==1)throw Error('Submission not authorized or already attempted');return {application_id:id,attempt_token:token,warning:'One authorized external submission attempt only; never retry after an uncertain outcome.'};
 }
 async confirm(id,{attempt_token,provider_reference}){assertId(attempt_token,'attempt token');safeString(provider_reference,'provider confirmation reference',300);const stamp=iso();
  const row=await this.get(id);if(!row)throw Error('Application not found');if(row.attempt_token!==attempt_token)throw Error('Submission token mismatch');
  if(row.status==='submitted'){if(row.provider_reference===provider_reference)return {application:row,already_recorded:true};throw Error('Conflicting submission receipt');}
  const r=await this.sql("UPDATE ats_applications SET status='submitted',provider_reference=?,confirmed_at=?,updated_at=? WHERE tenant_id=? AND id=? AND attempt_token=? AND status='submitting'",provider_reference,stamp,stamp,this.tenantId,id,attempt_token).run();
  if(r.meta.changes!==1)throw Error('Cannot confirm an unverified or uncertain submission');return {application:await this.get(id),already_recorded:false};
 }
 async uncertain(id,{attempt_token,reason}){assertId(attempt_token,'attempt token');safeString(reason,'uncertainty reason',500);const stamp=iso();
  const r=await this.sql("UPDATE ats_applications SET status='needs_reconciliation',last_error=?,updated_at=? WHERE tenant_id=? AND id=? AND attempt_token=? AND status='submitting'",reason,stamp,this.tenantId,assertId(id,'application ID'),attempt_token).run();
  if(r.meta.changes!==1)throw Error('Application unavailable or no active submission');return this.get(id);
 }
 async cancel(id){const stamp=iso();const r=await this.sql("UPDATE ats_applications SET status='cancelled',updated_at=? WHERE tenant_id=? AND id=? AND status IN ('discovered','prepared','approved')",stamp,this.tenantId,assertId(id,'application ID')).run();if(r.meta.changes!==1)throw Error('Cannot cancel an attempted submission');return this.get(id);}
}
