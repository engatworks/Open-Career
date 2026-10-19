import { z } from 'zod';
import { parse } from 'csv-parse/sync';
const now=()=>new Date().toISOString();
const short=(x,n=240)=>String(x??'').normalize('NFKC').trim().slice(0,n);
const generic=/^(info|contact|sales|support|admin|office|hello|enquiries|inquiries|careers?|jobs?|hr|recruitment|marketing|service)@/i;
const rowSchema=z.object({email:z.string().email().max(200),name:z.string().max(160),role:z.string().max(200),company:z.string().max(200),location:z.string().max(200),source_url:z.string().nullable()});

export function parseContactImport(input,checkURL){
 const provider=short(input.provider,80);if(!provider)throw Error('Name the source provider or file');
 let records=input.records;
 if(typeof input.csv==='string'){
  if(input.csv.length>150000)throw Error('Import CSV exceeds 150000 characters; split into smaller files');
  records=parse(input.csv,{columns:headers=>headers.map(h=>h.replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[ _-]+/g,'_')),bom:true,skip_empty_lines:true,max_record_size:10000,relax_column_count:false,to:101});
 }
 if(!Array.isArray(records)||!records.length||records.length>100)throw Error('Import 1–100 rows per batch');
 return {provider,rows:records.map((r,index)=>{
  if(/guessed|inferred|pattern/i.test([r.email_source,r.email_status,r.evidence,r.provenance].join(' ')))throw Error('Row '+(index+1)+': inferred or guessed addresses are not accepted');
  const email=short(r.email??r.email_address??r.value,200).toLowerCase();
  const name=short(r.name??r.full_name??[r.first_name,r.last_name].filter(Boolean).join(' '),160);
  let source=short(r.source_url??r.source??input.source_url,2000)||null;
  if(source)source=checkURL(source).href;
  return rowSchema.parse({email,name,role:short(r.role??r.job_title??r.title??r.position,200),company:short(r.company??r.company_name??r.organization,200),location:short(r.location??[r.city,r.country].filter(Boolean).join(', '),200),source_url:source});
 })};
}

// Discovery database only. It has no method that reserves, sends or grants delivery eligibility.
export class ContactDatabase{
 constructor(career,helpers){this.c=career;this.h=helpers;}
 async importCompanies(input){
  const provider=short(input.provider,80);if(!provider)throw Error('Name the company dataset provider');
  let rows=input.records;
  if(typeof input.csv==='string'){
   if(input.csv.length>150000)throw Error('Company CSV exceeds 150000 characters; filter and split first');
   rows=parse(input.csv,{columns:h=>h.map(x=>x.trim().toLowerCase().replace(/[ _-]+/g,'_')),bom:true,skip_empty_lines:true,max_record_size:10000,to:101});
  }
  if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('Import 1–100 companies per batch');
  const prepared=rows.map(r=>{
   const website=String(r.domain||r.website||'').trim();
   if(!website)throw Error('Each company needs a domain or website');
   const domain=this.h.sourceURL(website.includes('://')?website:'https://'+website).hostname.replace(/^www\./,'');
   const name=short(r.name||r.company,200);if(!name)throw Error('Each company needs its published name');
   const source=this.h.sourceURL(r.source_url||input.source_url).href;
   const location=typeof r.location==='string'?r.location:[r.locality,r.region,r.country].filter(Boolean).join(', ');
   return this.c.stmt(`INSERT INTO company_inventory(domain,name,industry,location,provider,source_url,attribution,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(domain) DO UPDATE SET name=excluded.name,industry=excluded.industry,location=excluded.location,provider=excluded.provider,source_url=excluded.source_url,attribution=excluded.attribution,updated_at=excluded.updated_at`,domain,name,short(r.industry,200),short(location,200),provider,source,short(input.attribution,500),now());
  });
  await this.c.db.batch(prepared);return {processed:rows.length,notice:'Company discovery only; no person, Saudi branch, vacancy or email is inferred.'};
 }
 async companies(input={}){
  const q=short(input.q,100),offset=Math.max(0,Math.min(100000,Number(input.offset)||0));if(!Number.isInteger(offset))throw Error('Invalid page offset');
  const where=q?" WHERE (name||' '||domain||' '||industry||' '||location) LIKE ? ESCAPE '\\'":'',args=q?['%'+q.replace(/[\\%_]/g,'\\$&')+'%']:[];
  return {total:Number((await this.c.stmt('SELECT COUNT(*) n FROM company_inventory'+where,...args).first()).n),items:(await this.c.stmt('SELECT * FROM company_inventory'+where+' ORDER BY name,domain LIMIT 50 OFFSET ?',...args,offset).all()).results,offset,limit:50};
 }
 async save(rows,provider,kind='imported'){
  const stamp=now(),statements=[],emails=new Set();
  for(const row of rows){
   const domain=row.email.split('@')[1],evidence=JSON.stringify(row.evidence||{name:row.name,role:row.role,company:row.company,location:row.location,limitation:'Imported claims; publication, identity and current employment not yet checked.'});
   const fingerprint=row.fingerprint||await this.h.hash(evidence);
   const id=await this.h.hash(JSON.stringify([row.email,row.source_url,provider,kind,fingerprint]));
   statements.push(this.c.stmt(`INSERT INTO contact_index(email,company_domain,company,name,role,location,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET company=CASE WHEN contact_index.company='' THEN excluded.company ELSE contact_index.company END,name=CASE WHEN contact_index.name='' THEN excluded.name ELSE contact_index.name END,role=CASE WHEN contact_index.role='' THEN excluded.role ELSE contact_index.role END,location=CASE WHEN contact_index.location='' THEN excluded.location ELSE contact_index.location END,updated_at=excluded.updated_at`,row.email,domain,row.company||'',row.name||'',row.role||'',row.location||'',stamp,stamp));
   statements.push(this.c.stmt(`INSERT INTO contact_sources(id,email,source_url,kind,provider,fingerprint,observed_at,evidence) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET observed_at=excluded.observed_at`,id,row.email,row.source_url||null,kind,provider,fingerprint,stamp,evidence));emails.add(row.email);
  }
  // Max 100 rows; D1 batch commits each import atomically.
  if(statements.length)await this.c.db.batch(statements);
  return {processed:rows.length,unique_in_batch:emails.size,delivery_eligible:false};
 }
 async import(input){const {rows,provider}=parseContactImport(input,this.h.sourceURL);const result=await this.save(rows,provider);await this.c.event('contacts_imported',{provider,rows:rows.length});return {...result,notice:'Imported records are candidates only. Provider verification is not original-source proof.'};}
 async collect(input){
  const urls=z.array(z.string().url()).min(1).max(5).parse(input.urls);
  urls.forEach(u=>this.h.sourceURL(u));const start=now(),report=[];
  for(const url of [...new Set(urls)]){
   try{
    const source=await this.c.inspectSource(url);
    const rows=source.contacts.slice(0,100).map(x=>({email:x.email,name:'',role:'',company:'',location:'',source_url:source.source_url,fingerprint:source.source_sha256,evidence:{contexts:x.contexts,page:x.page||null,format:source.source_format||'html',resolved_url:source.resolved_url||source.source_url,limitation:'Exact published candidate. Context is not automatic name ownership, employment proof or deliverability.'}}));
    const result=await this.save(rows,'Original public source','published_candidate');
    const host=new URL(source.resolved_url||url).hostname;
    const suggested=source.links.filter(l=>{try{return new URL(l.url).hostname===host&&/team|contact|about|management|leadership|people|فريق|تواصل|الإدارة/i.test(l.url+' '+l.label);}catch{return false;}}).slice(0,12);
    report.push({url,status:'collected',candidates:result.unique_in_batch,source_sha256:source.source_sha256,suggested_pages:suggested,diagnostics:source.diagnostics||[]});
   }catch(error){report.push({url,status:'held',reason:String(error.message||error).slice(0,1000)});}
  }
  const id=crypto.randomUUID();await this.c.stmt('INSERT INTO source_collections(id,started_at,finished_at,report) VALUES(?,?,?,?)',id,start,now(),JSON.stringify(report)).run();
  return {id,pages:report.length,collected:report.filter(x=>x.status==='collected').length,held:report.filter(x=>x.status==='held').length,results:report,delivery_eligible:false};
 }
 async search(input={}){
  const q=short(input.q,100),domain=short(input.domain,180).toLowerCase(),kind=String(input.kind||'');
  const limit=Math.max(1,Math.min(50,Number(input.limit)||25)),offset=Math.max(0,Math.min(100000,Number(input.offset)||0));
  if(!Number.isInteger(limit)||!Number.isInteger(offset))throw Error('Pagination must use whole numbers');
  const conditions=[],params=[];
  if(q){conditions.push("(c.email||' '||c.name||' '||c.role||' '||c.company||' '||c.location) LIKE ? ESCAPE '\\'");params.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}
  if(domain){conditions.push('c.company_domain=?');params.push(domain);}
  if(kind==='named')conditions.push("c.name<>''");
  if(kind==='published')conditions.push("EXISTS(SELECT 1 FROM contact_sources s WHERE s.email=c.email AND s.kind='published_candidate')");
  if(kind==='uncontacted')conditions.push("NOT EXISTS(SELECT 1 FROM outreach o WHERE (o.email=c.email OR o.domain=c.company_domain) AND o.status NOT IN ('cancelled','rejected')) AND NOT EXISTS(SELECT 1 FROM suppression p WHERE p.email=c.email)");
  const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
  const total=Number((await this.c.stmt('SELECT COUNT(*) n FROM contact_index c'+where,...params).first()).n);
  const rows=(await this.c.stmt(`SELECT c.*,(SELECT COUNT(*) FROM contact_sources s WHERE s.email=c.email) source_count,(SELECT MAX(observed_at) FROM contact_sources s WHERE s.email=c.email AND kind='published_candidate') publication_checked_at,EXISTS(SELECT 1 FROM suppression p WHERE p.email=c.email) suppressed,(SELECT status FROM outreach o WHERE (o.email=c.email OR o.domain=c.company_domain) AND o.status NOT IN ('cancelled','rejected') ORDER BY created_at DESC LIMIT 1) outreach_status FROM contact_index c${where} ORDER BY c.updated_at DESC,c.email LIMIT ? OFFSET ?`,...params,limit,offset).all()).results;
  return {total,limit,offset,items:rows.map(row=>({...row,address_type:generic.test(row.email)?'shared_inbox':'individual_candidate',delivery_eligible:false})),notice:'Named fields may be imported claims. Publication is separate from current role and outreach eligibility.'};
 }
 async detail(email){z.string().email().parse(email);const item=await this.c.stmt('SELECT * FROM contact_index WHERE email=?',email.toLowerCase()).first();if(!item)throw Error('Contact not found');const sources=(await this.c.stmt('SELECT * FROM contact_sources WHERE email=? ORDER BY observed_at DESC LIMIT 50',email.toLowerCase()).all()).results;return {item,sources:sources.map(s=>({...s,evidence:JSON.parse(s.evidence)})),delivery_eligible:false};}
 async stats(){return {counts:await this.c.stmt(`SELECT COUNT(*) contacts,COUNT(DISTINCT company_domain) email_domains,SUM(CASE WHEN name<>'' THEN 1 ELSE 0 END) named_claims FROM contact_index`).first(),published_candidates:Number((await this.c.stmt("SELECT COUNT(DISTINCT email) n FROM contact_sources WHERE kind='published_candidate'").first()).n),collections:(await this.c.stmt('SELECT * FROM source_collections ORDER BY finished_at DESC LIMIT 10').all()).results.map(x=>({...x,report:JSON.parse(x.report)})),notice:'Counts describe discovery, not verified recipients or job openings.'};}
}
