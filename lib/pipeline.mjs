import { z } from 'zod';
import { classifyFailure } from './worker-utils.mjs';
const stamp=()=>new Date().toISOString();
const campaigns=z.enum(['ireland-engineering','ksa-engineering']);
const stages=z.enum(['DISCOVER','RESEARCH','VERIFY','QUEUE','RESERVE','SEND','RECONCILE','COMPLETE','HELD']);
const settingsSchema=z.object({minimum_ready_per_country:z.number().int().min(1).max(250).default(50),research_concurrency:z.number().int().min(1).max(5).default(3),research_lease_minutes:z.number().int().min(5).max(60).default(15),max_read_attempts:z.number().int().min(1).max(5).default(3)});

// The Site has one owner. No public registration or shared Gmail credential is introduced.
// The backend owns durable work and receipts; native Gmail still needs its authorized task context.
export class Pipeline {
 constructor(career,helpers){this.c=career;this.h=helpers;}
 async settings(input){const current=await this.c.config('pipeline_settings',{});if(!input)return settingsSchema.parse(current);const value=settingsSchema.parse({...current,...input});await this.c.saveConfig('pipeline_settings',value);return value;}
 async canonical(value){const d=this.h.domain(value);return (await this.c.stmt('SELECT canonical_domain FROM employer_aliases WHERE alias_domain=?',d).first())?.canonical_domain||d;}
 async assertNewEmployer(value,email,ignoreId=null){
  const canonical=await this.canonical(value),emailDomain=email.split('@')[1];
  const domains=[canonical,value,emailDomain];
  const prior=await this.c.stmt(`SELECT id FROM outreach WHERE status NOT IN ('cancelled','rejected') AND id<>? AND (email=? OR domain IN (?,?,?) OR domain IN (SELECT alias_domain FROM employer_aliases WHERE canonical_domain IN (?,?,?))) LIMIT 1`,ignoreId||'',email,...domains,...domains).first();
  const imported=await this.c.stmt(`SELECT message_id FROM historical_receipts WHERE email=? OR company_domain IN (?,?,?) OR company_domain IN (SELECT alias_domain FROM employer_aliases WHERE canonical_domain IN (?,?,?)) LIMIT 1`,email,...domains,...domains).first();
  if(prior||imported)throw Error('This employer or corporate alias already has provider history; duplicate blocked');
  return canonical;
 }
 async commitVerified(packet,outreachId,evidence,context,runId){
  const canonical=await this.canonical(packet.company_domain),alias=packet.email.split('@')[1],now=stamp();
  const existing=await this.c.stmt('SELECT canonical_domain FROM employer_aliases WHERE alias_domain=?',alias).first();
  if(existing&&existing.canonical_domain!==canonical)throw Error('Corporate alias conflicts with another employer; hold for review');
  const result=await this.c.db.batch([
   this.c.stmt(`INSERT INTO employer_aliases(alias_domain,canonical_domain,source_url,source_quote,verified_at) VALUES(?,?,?,?,?) ON CONFLICT(alias_domain) DO NOTHING`,alias,canonical,packet.email_source_url,packet.contact_email_quote,now),
   this.c.stmt(`INSERT INTO outreach(id,email,domain,company,packet,status,created_at,profile_hash,cv_hash,run_id) SELECT ?,?,?,?,?,'queued',?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM suppression WHERE email=?)`,outreachId,packet.email,canonical,packet.company,JSON.stringify(packet),now,context.profile_sha256,context.cv.sha256,runId,packet.email),
   this.c.stmt(`INSERT INTO employer_pipeline(canonical_domain,company,campaign,stage,outreach_id,research,evidence,verified_at,updated_at,next_action) SELECT ?,?,?,'QUEUE',?,?,?,?,?,'reserve_once' WHERE EXISTS(SELECT 1 FROM outreach WHERE id=?) ON CONFLICT(canonical_domain) DO UPDATE SET stage='QUEUE',outreach_id=excluded.outreach_id,research=excluded.research,evidence=excluded.evidence,verified_at=excluded.verified_at,updated_at=excluded.updated_at,next_action='reserve_once',lease_token=NULL,lease_until=NULL`,canonical,packet.company,packet.campaign,outreachId,JSON.stringify(packet),JSON.stringify(evidence),now,now,outreachId)
  ]);
  if(result[1].meta.changes!==1)throw Error('Contact is suppressed');
 }
 async checkpoint(input){
  const p=z.object({domain:z.string(),company:z.string().min(2).max(180),campaign:campaigns,stage:stages,research:z.record(z.string(),z.unknown()).default({}),reason:z.string().max(1000).default(''),lease_token:z.string().uuid().optional()}).parse(input),d=await this.canonical(p.domain);
  if(!['DISCOVER','RESEARCH','VERIFY','HELD'].includes(p.stage))throw Error('Queue and delivery stages are set only by verified outreach operations');
  const row=await this.c.stmt('SELECT * FROM employer_pipeline WHERE canonical_domain=?',d).first();
  if(row?.outreach_id)throw Error('Outreach already owns this employer; use receipt or reconciliation operations');
  if(row?.lease_token&&row.lease_token!==p.lease_token&&row.lease_until>stamp())throw Error('Another research worker owns this employer lease');
  const changed=await this.c.stmt(`INSERT INTO employer_pipeline(canonical_domain,company,campaign,stage,research,updated_at,next_action,last_error) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(canonical_domain) DO UPDATE SET company=excluded.company,campaign=excluded.campaign,stage=excluded.stage,research=excluded.research,updated_at=excluded.updated_at,next_action=excluded.next_action,last_error=excluded.last_error,lease_token=NULL,lease_until=NULL WHERE employer_pipeline.outreach_id IS NULL AND (employer_pipeline.lease_token IS NULL OR employer_pipeline.lease_token=? OR employer_pipeline.lease_until<=?)`,d,p.company,p.campaign,p.stage,JSON.stringify(p.research),stamp(),p.stage==='HELD'?'manual_review':p.stage==='VERIFY'?'verify_packet':'research',p.reason||null,p.lease_token||'',stamp()).run();
  if(changed.meta.changes!==1)throw Error('Employer state changed or another research worker owns the lease');
  return {saved:true,domain:d,stage:p.stage,delivery_eligible:false};
 }
 async claim(input={}){
  const conf=await this.settings(),p=z.object({campaign:campaigns.optional(),limit:z.number().int().min(1).max(5).default(conf.research_concurrency)}).parse(input),now=stamp();await this.recover();
  const filter=p.campaign?' AND campaign=?':'',args=p.campaign?[now,p.campaign]:[now];
  const rows=(await this.c.stmt(`SELECT canonical_domain FROM employer_pipeline WHERE outreach_id IS NULL AND stage IN ('DISCOVER','RESEARCH','VERIFY') AND lease_token IS NULL AND (next_attempt_at IS NULL OR next_attempt_at<=?)${filter} ORDER BY updated_at LIMIT ?`,...args,Math.min(p.limit,conf.research_concurrency)).all()).results;
  const claimed=[];
  for(const row of rows){const token=crypto.randomUUID(),until=new Date(Date.now()+conf.research_lease_minutes*60000).toISOString();const change=await this.c.stmt(`UPDATE employer_pipeline SET stage=CASE WHEN stage='DISCOVER' THEN 'RESEARCH' ELSE stage END,lease_token=?,lease_until=?,updated_at=? WHERE canonical_domain=? AND lease_token IS NULL AND outreach_id IS NULL AND stage IN ('DISCOVER','RESEARCH','VERIFY') AND (next_attempt_at IS NULL OR next_attempt_at<=?) AND (SELECT COUNT(*) FROM employer_pipeline WHERE lease_token IS NOT NULL AND lease_until>?)<?`,token,until,now,row.canonical_domain,now,now,conf.research_concurrency).run();if(change.meta.changes===1)claimed.push(await this.c.stmt('SELECT * FROM employer_pipeline WHERE canonical_domain=? AND lease_token=?',row.canonical_domain,token).first());}
  return {items:claimed,lease_minutes:conf.research_lease_minutes,automatic_send:false};
 }
 async fail(input){
  const p=z.object({domain:z.string(),lease_token:z.string().uuid(),error:z.string().min(3).max(1000)}).parse(input),d=await this.canonical(p.domain),conf=await this.settings();
  const row=await this.c.stmt('SELECT * FROM employer_pipeline WHERE canonical_domain=? AND lease_token=?',d,p.lease_token).first();if(!row||row.outreach_id)throw Error('No matching research lease');
  const error=classifyFailure(p.error),attempts=row.attempts+1,retry=error.retry&&attempts<conf.max_read_attempts;
  const next=retry?new Date(Date.now()+Math.min(3600000,60000*2**attempts)).toISOString():null;
  const changed=await this.c.stmt(`UPDATE employer_pipeline SET stage=?,attempts=?,next_attempt_at=?,last_error=?,error_class=?,next_action=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE canonical_domain=? AND lease_token=? AND outreach_id IS NULL AND lease_until>?`,retry?row.stage:'HELD',attempts,next,p.error,error.kind,retry?'retry_read':'manual_review',stamp(),d,p.lease_token,stamp()).run();
  if(changed.meta.changes!==1)throw Error('Research lease expired or employer state changed');
  await this.c.event('pipeline_failure',{domain:d,error_class:error.kind,attempts,retry,next_attempt_at:next});return {retry,attempts,next_attempt_at:next,error_class:error.kind};
 }
 async recover(){
  const now=stamp(),stale=new Date(Date.now()-15*60000).toISOString(),conf=await this.settings();
  const result=await this.c.db.batch([
   this.c.stmt(`UPDATE outreach SET status='needs_reconciliation',last_error='Worker interrupted after reservation; inspect Gmail before any further action' WHERE status='sending' AND reserved_at<?`,stale),
   this.c.stmt(`UPDATE employer_pipeline SET lease_token=NULL,lease_until=NULL,stage=CASE WHEN attempts+1>=? THEN 'HELD' ELSE stage END,attempts=attempts+1,error_class='interrupted_research',last_error='Research lease expired',next_action=CASE WHEN attempts+1>=? THEN 'manual_review' ELSE 'resume_research' END,updated_at=? WHERE lease_until<? AND outreach_id IS NULL`,conf.max_read_attempts,conf.max_read_attempts,now,now)
  ]);
  const quarantined=result[0].meta.changes,recovered=result[1].meta.changes;
  if(quarantined||recovered)await this.c.event('worker_recovery',{quarantined,recovered,automatic_send_retry:false});return {quarantined,recovered,automatic_send_retry:false};
 }
 async importHistory(input){
  const p=z.object({records:z.array(z.object({company:z.string().min(2).max(180),company_domain:z.string(),email:z.string().email(),message_id:z.string().regex(/^[a-f0-9]{8,32}$/),thread_id:z.string().regex(/^[a-f0-9]{8,32}$/).optional(),sent_at:z.string().datetime(),subject:z.string().max(200),status:z.enum(['sent','replied','bounced','declined','uncertain']).default('sent'),campaign:campaigns.optional(),cv_sha256:z.string().regex(/^[a-f0-9]{64}$/).optional()})).min(1).max(100)}).parse(input);
  const rows=[];const seen=new Map();
  for(const r of p.records){const row={...r,company_domain:await this.canonical(r.company_domain),email:r.email.toLowerCase()};
   if(Date.parse(row.sent_at)>Date.now()+300000)throw Error('Historical provider receipt cannot be in the future');
   const inBatch=seen.get(row.message_id),prior=await this.c.stmt('SELECT * FROM historical_receipts WHERE message_id=?',row.message_id).first(),ledger=await this.c.stmt('SELECT email FROM outreach WHERE message_id=?',row.message_id).first();
   if([inBatch,prior].some(other=>other&&(other.email!==row.email||other.company_domain!==row.company_domain))||ledger&&ledger.email!==row.email)throw Error('Historical provider receipt conflicts with existing employer');
   seen.set(row.message_id,row);rows.push(row);
  }
  await this.c.db.batch(rows.map(r=>this.c.stmt(`INSERT INTO historical_receipts(message_id,thread_id,company_domain,company,email,sent_at,subject,status,campaign,cv_sha256,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(message_id) DO NOTHING`,r.message_id,r.thread_id||null,r.company_domain,r.company,r.email,r.sent_at,r.subject,r.status,r.campaign||null,r.cv_sha256||null,stamp())));
  await this.c.event('history_reconciled',{records:rows.length});return {saved:true,processed:rows.length,new_delivery_count:0,notice:'Reconciled historical Gmail evidence suppresses employers; it is not counted as new outreach.'};
 }
 async status(){
  const conf=await this.settings(),now=stamp(),fresh=new Date(Date.now()-86400000).toISOString(),result={};
  const cv=await this.c.config('cv'),profile=await this.c.profile(),profileHash=profile?await this.h.hash(JSON.stringify(profile)):'';
  for(const campaign of ['ireland-engineering','ksa-engineering']){
   const ready=Number((await this.c.stmt(`SELECT COUNT(*) n FROM outreach WHERE status='queued' AND created_at>=? AND cv_hash=? AND profile_hash=? AND json_extract(packet,'$.research_review.checked_at')>=? AND COALESCE(json_extract(packet,'$.campaign'),'ksa-engineering')=? AND NOT EXISTS(SELECT 1 FROM suppression s WHERE s.email=outreach.email) AND NOT EXISTS(SELECT 1 FROM historical_receipts h WHERE h.email=outreach.email OR h.company_domain=outreach.domain)`,fresh,cv?.sha256||'',profileHash,fresh,campaign).first()).n);
   const delivered=Number((await this.c.stmt(`SELECT COUNT(*) n FROM outreach WHERE ${this.h.confirmedSQL} AND sent_at>=? AND sent_at<? AND COALESCE(json_extract(packet,'$.campaign'),'ksa-engineering')=?`,this.h.riyadhDayStart(),new Date(Date.parse(this.h.riyadhDayStart())+86400000).toISOString(),campaign).first()).n);
   const stages=(await this.c.stmt(`SELECT stage,SUM(n) n FROM (SELECT CASE status WHEN 'queued' THEN 'QUEUE' WHEN 'sending' THEN 'SEND' WHEN 'needs_reconciliation' THEN 'RECONCILE' WHEN 'sent' THEN 'COMPLETE' WHEN 'replied' THEN 'COMPLETE' ELSE 'HELD' END stage,COUNT(*) n FROM outreach WHERE COALESCE(json_extract(packet,'$.campaign'),'ksa-engineering')=? GROUP BY status UNION ALL SELECT stage,COUNT(*) n FROM employer_pipeline WHERE campaign=? AND outreach_id IS NULL GROUP BY stage) GROUP BY stage`,campaign,campaign).all()).results;
   result[campaign]={qualified_unsent:ready,delivered_today:delivered,remaining_delivery_target:Math.max(0,25-delivered),inventory_threshold:conf.minimum_ready_per_country,replenishment_needed:ready<conf.minimum_ready_per_country,stages:Object.fromEntries(stages.map(x=>[x.stage,x.n]))};
  }
  const uncertain=Number((await this.c.stmt("SELECT COUNT(*) n FROM outreach WHERE status IN ('sending','needs_reconciliation')").first()).n);
  const alerts=[];for(const [campaign,row] of Object.entries(result))if(row.replenishment_needed)alerts.push({campaign,stage:'research_or_verification',code:'LOW_QUALIFIED_INVENTORY',ready:row.qualified_unsent,threshold:row.inventory_threshold});if(uncertain)alerts.push({stage:'reconciliation',code:'UNCERTAIN_DELIVERY',count:uncertain,automatic_retry:false});
  alerts.push({stage:'execution',code:'NATIVE_GMAIL_TASK_REQUIRED',detail:'This Site has no autonomous Gmail grant or hosting cron. A registered ChatGPT cloud task supplies research and native Gmail operations; registration does not prove future execution.'});
  return {checked_at:now,campaigns:result,settings:conf,alerts,uncertain_deliveries:uncertain,historical_receipts:Number((await this.c.stmt('SELECT COUNT(*) n FROM historical_receipts').first()).n),backend_independent_gmail:false,worker_recovery:'stale reservations quarantine on recovery/start-run; never resend automatically',inventory_is_not_delivery:true};
 }
}
