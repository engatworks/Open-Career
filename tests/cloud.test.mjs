import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { Career, hash, validatePacket, visibleText, verifyEvidence, sourceURL, inspectSource } from '../lib/career.mjs';
import { extractPublicSource } from '../lib/public-source.mjs';

class D1 {
 constructor(){this.db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())this.db.exec(fs.readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));}
 prepare(sql){const db=this.db;let values=[];const api={bind(...a){values=a;return api;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},run(){const before=db.prepare('SELECT total_changes() n').get().n;const stmt=db.prepare(sql);const results=stmt.columns().length?stmt.all(...values):(stmt.run(...values),[]);return {results,meta:{changes:Number(db.prepare('SELECT total_changes() n').get().n-before)}};}};return api;}
 async batch(statements){this.db.exec('BEGIN');try{const results=statements.map(s=>s.run());this.db.exec('COMMIT');return results;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
class Bucket{constructor(){this.values=new Map();}async put(key,bytes){this.values.set(key,new Uint8Array(bytes));}async get(key){const data=this.values.get(key);return data?{arrayBuffer:async()=>data.slice().buffer}:null;}}
const profile={name:'Test Candidate',target_roles:['Junior Electrical Engineer'],evidence:[{id:'panels',claim:'Assisted with supervised control-panel assembly and testing.'}]};
const secondary='Our engineering team builds industrial control panels';
const html='<p>Sara Ahmed — Engineering Manager. Email: sara.ahmed@example.com</p><p>The new substation commissioning program has started.</p><p>Our engineering team builds industrial control panels.</p>';
const fetcher=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':html,{headers:{'content-type':String(url).endsWith('/robots.txt')?'text/plain':'text/html'}});
async function setup(){const c=new Career({DB:new D1(),BUCKET:new Bucket()},fetcher);await c.setProfile(profile);const cv=new TextEncoder().encode('%PDF-1.4 test');await c.uploadCV(cv);await c.saveConfig('verification',{background_send:true,attachment_sha256:await hash(cv)});return {c,cv};}
async function packet(c,number=0){const cv=await c.config('cv');const d=number?'company'+number+'.com':'example.com';return {named_search:{queries:['site:'+d+' engineering manager'],sources:['https://'+d+'/team'],outcome:'Original team page binds the engineering manager to the individual work email.'},research_review:{company_review:'Original company source describes a substation commissioning program relevant to supervised junior panel support.',person_review:'Sara Ahmed is listed as Engineering Manager on the official team page together with the exact individual work email.',selection_reason:'Engineering work is relevant to junior panel assembly and testing support.',checked_at:new Date().toISOString(),sources:['https://'+d+'/team','https://'+d+'/news'],conflict_queries:['Sara Ahmed Example Power current employer'],conflict_outcome:'Reviewed current original team page; no conflicting employment evidence found.',unresolved_conflict:false,limitations:'No vacancy or mailbox deliverability independently established.'},company:'Example Power',company_domain:d,contact_name:'Sara Ahmed',contact_role:'Engineering Manager',email:'sara.ahmed@'+d,email_evidence:'exact_published',email_source_url:'https://'+d+'/team',contact_role_source:'https://'+d+'/team',contact_role_quote:'Sara Ahmed — Engineering Manager',contact_email_quote:'Sara Ahmed — Engineering Manager. Email: sara.ahmed@'+d,company_fact:{statement:'The new substation commissioning program has started',source_quote:'The new substation commissioning program has started',source_url:'https://'+d+'/news'},company_fact_secondary:{statement:secondary,source_quote:secondary,source_url:'https://'+d+'/news'},personalization_reason:'Published commissioning activity matches supervised panel experience',candidate_fact_ids:['panels'],subject:'I have nothing to offer, but I want in',body:'Dear Sara,\n\nThe new substation commissioning program has started, and this work caught my attention because of its relevance to electrical commissioning. I assisted with supervised control-panel assembly and testing. I am seeking a paid junior electrical engineering position and would appreciate an opportunity to discuss how this background may support the team. Our engineering team builds industrial control panels, as your site explains. My CV is attached for your consideration, and I would be grateful for an introduction to the colleague responsible for suitable vacancies.\n\nKind regards,\nTest Candidate',cv_sha256:cv.sha256};}

test('persistent CV roundtrip and changed fingerprint holds prepared message',async()=>{const {c,cv}=await setup();assert.equal(await hash(cv),(await c.context()).cv.sha256);const ctx=await c.context(true);assert.deepEqual(Buffer.from(ctx.cv_base64_url,'base64url'),Buffer.from(cv));const p=await packet(c),q=await c.queue(p);await c.setSettings({live_send_enabled:true});await c.uploadCV(new TextEncoder().encode('%PDF-1.4 changed'));await assert.rejects(c.reserve(q.id),/changed/);});
test('duplicate company/contact blocked and cancelled unsent message can be rebuilt',async()=>{const {c}=await setup();const p=await packet(c),q=await c.queue(p);await assert.rejects(c.queue(p),/duplicate/);await c.cancel(q.id);assert.ok((await c.queue(p)).queued);});
test('reservation produces exact PDF and confirms real provider receipt once',async()=>{const {c,cv}=await setup();const q=await c.queue(await packet(c));await c.setSettings({live_send_enabled:true});const r=await c.reserve(q.id);assert.equal(r.payload.parts[1].filename,'CV.pdf');assert.deepEqual(Buffer.from(r.payload.parts[1].body.base64_url_content,'base64url'),Buffer.from(cv));await c.receipt({reservation_token:r.reservation_token,message_id:'1000000000000001',thread_id:'1000000000000001'});assert.equal((await c.list())[0].status,'sent');await assert.rejects(c.reserve(q.id),/processed/);assert.equal((await c.receipt({reservation_token:r.reservation_token,message_id:'1000000000000001',thread_id:'1000000000000001'})).already_recorded,true);await assert.rejects(c.receipt({reservation_token:r.reservation_token,message_id:'2000000000000002'}),/conflicts/);});
test('unknown delivery remains reserved and cannot be retried',async()=>{const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c)),r=await c.reserve(q.id);await c.uncertain(r.reservation_token,'Timeout after provider request');assert.equal(await c.quota(),1);await assert.rejects(c.reserve(q.id),/unknown/);assert.equal((await c.list())[0].status,'needs_reconciliation');});
test('Riyadh daily 25-send quota atomically resists concurrent reservations',async()=>{const {c}=await setup();await c.setSettings({live_send_enabled:true});const ids=[];c.fetcher=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':html.replaceAll('example.com',new URL(url).hostname),{headers:{'content-type':String(url).endsWith('/robots.txt')?'text/plain':'text/html'}});for(let i=1;i<=30;i++)ids.push((await c.queue(await packet(c,i))).id);const results=await Promise.allSettled(ids.map(id=>c.reserve(id)));assert.equal(results.filter(x=>x.status==='fulfilled').length,25);assert.equal(await c.quota(),25);});

test('a sent message from a previous Riyadh day does not reduce today’s quota',async()=>{const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c)),r=await c.reserve(q.id);await c.receipt({reservation_token:r.reservation_token,message_id:'1000000000000001'});await c.stmt('UPDATE outreach SET sent_at=? WHERE id=?','2020-01-01T00:00:00.000Z',q.id).run();assert.equal(await c.quota(),0);assert.equal((await c.status()).daily_cap,50);assert.equal((await c.status()).daily_cap_per_campaign,25);});

test('profile edits and opt-outs block send and preserve history',async()=>{const {c}=await setup();await c.setSettings({live_send_enabled:true});let q=await c.queue(await packet(c));await c.suppress('sara.ahmed@example.com','Not interested');assert.equal((await c.list())[0].status,'cancelled');await assert.rejects(c.queue(await packet(c)),/suppressed/);await assert.rejects(c.reserve(q.id),/processed/);});
test('source parser excludes scripts/comments and exact evidence rejects inventions',async()=>{assert.equal(visibleText('<script>x="mailto:secret@corp.com"</script><!--hidden@example.com--><p>Actual &amp; public</p>'),'actual & public');const {c}=await setup();const p=await packet(c);p.company_fact.source_quote='Invented project fact unavailable';await assert.rejects(verifyEvidence(p,fetcher),/not found/);});
test('robots disallow and private source schemes fail closed',async()=>{const {c}=await setup();const p=await packet(c);await assert.rejects(verifyEvidence(p,async()=>new Response('User-agent: *\nDisallow: /',{headers:{'content-type':'text/plain'}})),/robots/);for(const url of ['http://example.com','https://127.0.0.1','https://x.internal','https://u:p@example.com'])assert.throws(()=>sourceURL(url));});
test('source-backed candidate claims required and profile change held at delivery',async()=>{const {c}=await setup();const p=await packet(c),cv=await c.config('cv');assert.throws(()=>validatePacket({...p,body:p.body.replace('assisted with supervised control-panel assembly and testing','led a major independent engineering project')},profile,cv),/candidate claim/);});
test('run cannot overlap and finish counts are based on database not report prose',async()=>{const {c}=await setup();const {run_id}=await c.startRun();await assert.rejects(c.startRun(),/already active/);await c.queue(await packet(c),run_id);const report=await c.finishRun(run_id,{discovered:1,researched:1,queued:15,sent:15,held:0,reasons:[]});assert.equal(report.queued,1);assert.equal(report.sent,0);assert.equal(report.status,'partial');});


test('official careers invitation works without inventing a named person; generic inbox and third-party page fail',async()=>{const {c}=await setup();const p=await packet(c);Object.assign(p,{named_search:{queries:['site:example.com engineering manager'],sources:['https://example.com/team'],outcome:'No named relevant person with a published work email was found.'},contact_type:'recruitment_team',contact_name:'Recruitment Team',contact_role:'Recruitment',email:'careers@example.com',email_source_url:'https://example.com/careers',contact_role_source:'https://example.com/careers',contact_role_quote:'Join our engineering team',contact_email_quote:'Send your CV to careers@example.com',body:p.body.replace('Dear Sara','Dear Recruitment Team')});c.fetcher=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':html+'<p>Join our engineering team</p><p>Send your CV to careers@example.com</p>',{headers:{'content-type':'text/html'}});assert.equal((await c.queue(p)).queued,true);const cv=await c.config('cv');assert.throws(()=>validatePacket({...p,contact_email_quote:'Sales contact: careers@example.com'},profile,cv),/invitation/);assert.throws(()=>validatePacket({...p,email_source_url:'https://unrelated.com/list'},profile,cv),/employer website/);assert.throws(()=>validatePacket({...p,contact_name:'Invented Manager',body:p.body.replace('Recruitment Team','Invented Manager')},profile,cv),/team/);});
test('delivery requires background proof for the current attachment, not a successful draft',async()=>{const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c));await c.saveConfig('verification',{gmail_attachment:true,background_send:false});assert.equal((await c.status()).delivery_configured,false);await assert.rejects(c.reserve(q.id),/Background delivery verification/);assert.equal(await c.quota(),0);});
test('pausing while sources are being checked prevents the atomic reservation',async()=>{const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c));const original=c.fetcher;c.fetcher=async(...args)=>{await c.setSettings({live_send_enabled:false});return original(...args);};await assert.rejects(c.reserve(q.id),/blocked delivery/);assert.equal(await c.quota(),0);});
test('actual decline evidence suppresses recipient without erasing send history or quota',async()=>{const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c)),r=await c.reserve(q.id);await c.receipt({reservation_token:r.reservation_token,message_id:'1000000000000001'});const feedback={id:q.id,kind:'decline',message_id:'2000000000000002',received_at:new Date().toISOString(),summary:'Recipient asked for no further contact.'};await c.feedback(feedback);assert.equal((await c.feedback(feedback)).already_recorded,true);assert.equal((await c.list())[0].status,'sent');assert.equal(await c.quota(),1);assert.ok(await c.stmt('SELECT email FROM suppression WHERE email=?','sara.ahmed@example.com').first());});
test('cancelled queue is not counted as completed work and closed run cannot heartbeat',async()=>{const {c}=await setup();const {run_id}=await c.startRun();await c.heartbeat(run_id);const q=await c.queue(await packet(c),run_id);await c.cancel(q.id);const r=await c.finishRun(run_id,{discovered:1,researched:1,queued:15,sent:15,held:1,reasons:[]});assert.equal(r.queued,0);await assert.rejects(c.heartbeat(run_id),/no longer active/);assert.ok((await c.context()).agent_guide.api['POST /api/queue']);});

test('inline mail links preserve punctuation and mailto-only targets stay with their own person',()=>{
 const markup='<p>Send your CV to <a href="mailto:careers@example.com">careers@example.com</a>.</p><div><h3>Sara Ahmed</h3><p>Engineering Manager</p><a href="mailto:sara%2Eahmed@example.com?subject=Hello">Email Sara</a></div><footer><a href="mailto:other@example.com">Other team</a></footer>';
 const r=extractPublicSource(markup,'https://example.com/team');
 assert.ok(r.text.includes('Send your CV to careers@example.com.'));
 assert.ok(r.text.includes('Sara Ahmed Engineering Manager Email Sara (sara.ahmed@example.com)'));
 assert.ok(!r.text.includes('Sara Ahmed Engineering Manager Email Sara (other@example.com)'));
 assert.ok(r.contacts.find(c=>c.email==='sara.ahmed@example.com').contexts.some(c=>c.includes('Sara Ahmed')));
 assert.equal(r.contacts[0].identity_verified,false);
});

test('hidden/attribute-only addresses and scripts cannot supply public identity evidence',()=>{
 const r=extractPublicSource('<div hidden><a href="mailto:hidden@example.com">Hidden</a></div><p aria-hidden="true">secret@example.com</p><template>template@example.com</template><span style="display:none">private@example.com</span><p title="attr@example.com">Public</p><script>script@example.com</script>');
 assert.equal(r.text,'Public');assert.deepEqual(r.contacts,[]);
});

test('source inspection respects robots and exposes publication without claiming identity',async()=>{
 const r=await inspectSource('https://example.com/team',fetcher);assert.ok(r.contacts.some(x=>x.email==='sara.ahmed@example.com'));assert.match(r.source_sha256,/^[a-f0-9]{64}$/);assert.equal(r.contacts[0].identity_verified,false);
 await assert.rejects(inspectSource('https://example.com/team',async()=>new Response('User-agent: *\nDisallow: /')),/robots/);
 await assert.rejects(inspectSource('https://example.com/team',async u=>new Response(String(u).endsWith('robots.txt')?'User-agent: *\nAllow: /':'PDF',{headers:{'content-type':'application/pdf'}})),/Invalid PDF signature/);
});

test('speculative outreach needs no vacancy; advertised roles and recruitment fallbacks need evidence',async()=>{
 const {c}=await setup(),p=await packet(c),cv=await c.config('cv');
 assert.equal(validatePacket(p,profile,cv).intent,'speculative_referral');
 assert.throws(()=>validatePacket({...p,intent:'advertised_role'},profile,cv),/advertised role/);
 assert.throws(()=>validatePacket({...p,named_search:undefined,contact_type:'recruitment_team'},profile,cv),/team/);
 await assert.rejects(verifyEvidence({...p,intent:'advertised_role',vacancy:{source_url:'https://example.com/jobs',source_quote:'Invented junior electrical vacancy',eligibility_review:'The profile meets the listed requirements.'}},fetcher),/vacancy quote/);
});

test('real punctuation regression verifies; a different mailbox or invented ownership does not',async()=>{
 const {c}=await setup(),p=await packet(c);
 const source=html.replace('Email: sara.ahmed@example.com','Email: <a href="mailto:sara.ahmed@example.com">sara.ahmed@example.com</a>.');
 const f=async u=>new Response(String(u).endsWith('robots.txt')?'User-agent: *\nAllow: /':source,{headers:{'content-type':'text/html'}});
 await verifyEvidence({...p,contact_email_quote:p.contact_email_quote+'.'},f);
 await assert.rejects(verifyEvidence({...p,email:'sara.ahmed@example.com.evil'},f),/email\/name/);
 await assert.rejects(verifyEvidence({...p,contact_email_quote:'Different Person sara.ahmed@example.com'},f),/email\/name/);
});

test('delivered contact mix is derived from actual stored receipts',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const {run_id}=await c.startRun();const q=await c.queue(await packet(c),run_id),r=await c.reserve(q.id);await c.receipt({reservation_token:r.reservation_token,message_id:'1000000000000001'});
 const report=await c.finishRun(run_id,{discovered:1,researched:1,queued:99,sent:99,held:0,reasons:[]});assert.equal(report.named_sent,1);assert.equal(report.recruitment_sent,0);assert.deepEqual((await c.status()).contact_mix,{named_person:1,recruitment_team:0});
});


test('research review rejects missing, stale, duplicate-source and conflicting person evidence',async()=>{
 const {c}=await setup(),p=await packet(c),cv=await c.config('cv');
 assert.throws(()=>validatePacket({...p,research_review:undefined},profile,cv));
 for(const patch of [{unresolved_conflict:true},{checked_at:'2020-01-01T00:00:00.000Z'},{checked_at:new Date(Date.now()+3600000).toISOString()},{sources:['https://example.com/team','https://example.com/team']}])assert.throws(()=>validatePacket({...p,research_review:{...p.research_review,...patch}},profile,cv));
 assert.throws(()=>validatePacket({...p,named_search:undefined},profile,cv),/Named-person inquiries/);
});
test('legacy packets lacking research review cannot reserve delivery',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const p=await packet(c),q=await c.queue(p);delete p.research_review;await c.stmt('UPDATE outreach SET packet=? WHERE id=?',JSON.stringify(p),q.id).run();await assert.rejects(c.reserve(q.id));assert.equal(await c.quota(),0);assert.equal((await c.list())[0].status,'queued');
});

const { textPDF } = await import('./pdf-fixture.mjs');
const pdfFetch = bytes => async url => String(url).endsWith('/robots.txt')
 ? new Response('User-agent: *\nAllow: /') : new Response(bytes, {headers:{'content-type':'application/pdf'}});

test('official PDF evidence supports inspection, queue and fresh reservation without changing CV',async()=>{
 const bytes=textPDF([['Sara Ahmed - Engineering Manager. Email: sara.ahmed@example.com','The new substation commissioning program has started.',secondary]]);
 const f=pdfFetch(bytes), result=await inspectSource('https://example.com/contacts.pdf',f);
 assert.equal(result.source_format,'pdf');assert.equal(result.total_pages,1);assert.equal(result.source_sha256,await hash(bytes));
 assert.equal(result.contacts[0].email,'sara.ahmed@example.com');assert.equal(result.contacts[0].page,1);assert.equal(result.contacts[0].identity_verified,false);
 const {c,cv}=await setup();c.fetcher=f;const p=await packet(c);
 p.contact_role_quote=p.contact_role_quote.replace('—','-');p.contact_email_quote=p.contact_email_quote.replace('—','-');
 const q=await c.queue(p);assert.equal(q.evidence.fingerprints[0].format,'pdf');
 await c.setSettings({live_send_enabled:true});const r=await c.reserve(q.id);
 assert.deepEqual(Buffer.from(r.payload.parts[1].body.base64_url_content,'base64url'),Buffer.from(cv));
});
test('PDF page boundaries cannot invent email ownership and changed PDF blocks reservation',async()=>{
 const {c}=await setup(),p=await packet(c);
 p.contact_role_quote='Sara Ahmed Engineering Manager';p.contact_email_quote='Sara Ahmed Engineering Manager sara.ahmed@example.com';
 const split=textPDF([['Sara Ahmed Engineering Manager'],['sara.ahmed@example.com','The new substation commissioning program has started']]);
 await assert.rejects(verifyEvidence(p,pdfFetch(split)),/email\/name/);
 c.fetcher=pdfFetch(textPDF([[p.contact_email_quote,p.company_fact.source_quote,secondary]]));
 const q=await c.queue(p);await c.setSettings({live_send_enabled:true});c.fetcher=pdfFetch(split);
 await assert.rejects(c.reserve(q.id),/email\/name/);assert.equal(await c.quota(),0);
});
test('PDF parser rejects malformed, image-only, oversized and excessive-page inputs',async()=>{
 for(const [bytes,error] of [[new TextEncoder().encode('fake'),/signature/],[textPDF([[]]),/no extractable text/],[textPDF(Array.from({length:31},()=>['Sample'])),/30 pages/],[new Uint8Array(2000001),/2 MB/]])
  await assert.rejects(inspectSource('https://example.com/file.pdf',pdfFetch(bytes)),error);
});
test('redirect targets get robots checks and cross-origin destinations remain explicit holds',async()=>{
 let forbiddenRead=false;
 const f=async url=>{
  if(String(url).endsWith('/robots.txt'))return new Response('User-agent: *\nDisallow: /private');
  if(String(url).endsWith('/start'))return new Response(null,{status:302,headers:{location:'/private'}});
  forbiddenRead=true;return new Response(html,{headers:{'content-type':'text/html'}});
 };
 await assert.rejects(inspectSource('https://example.com/start',f),/robots/);assert.equal(forbiddenRead,false);
 await assert.rejects(inspectSource('https://example.com/start',async url=>String(url).endsWith('/robots.txt')?new Response('User-agent: *\nAllow: /'):new Response(null,{status:302,headers:{location:'https://other.example.com/team'}})),/inspect destination separately: https:\/\/other.example.com\/team/);
 const r=await inspectSource('https://example.com/empty',async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':'<script>render()</script>',{headers:{'content-type':'text/html'}}));assert.match(r.diagnostics[0],/JavaScript shell/);
});

test('contact imports are atomic, deduplicated and never promote provider claims to publication or delivery',async()=>{
 const {c}=await setup(),db=c.contacts();
 const input={provider:'Permitted provider export',csv:'Email,First Name,Last Name,Job Title,Company\nsara.ahmed@example.com,Sara,Ahmed,Engineering Manager,Example Power'};
 await db.import(input);await db.import(input);
 assert.equal((await db.search()).total,1);assert.equal((await db.stats()).published_candidates,0);assert.equal((await c.list()).length,0);
 const item=(await db.search({q:'Sara'})).items[0];assert.equal(item.name,'Sara Ahmed');assert.equal(item.delivery_eligible,false);assert.equal(item.source_count,1);
 await assert.rejects(db.import({provider:'Test',records:[{email:'valid@example.com'},{email:'invalid'}]}));assert.equal((await db.search()).total,1);
 await assert.rejects(db.import({provider:'Test',records:[{email:'guess@example.com',email_source:'inferred'}]}),/inferred/);
 await assert.rejects(db.import({provider:'Test',records:Array.from({length:101},()=>({email:'x@example.com'}))}),/1–100/);
});
test('source collection records original evidence and failures; dedupe and suppression remain in force',async()=>{
 const {c}=await setup(),db=c.contacts();
 const input={urls:['https://example.com/team']};await db.collect(input);await db.collect(input);
 const stats=await db.stats();assert.equal(stats.published_candidates,1);assert.equal(stats.counts.contacts,1);
 const record=await db.detail('sara.ahmed@example.com');assert.equal(record.sources.length,1);assert.match(record.sources[0].evidence.contexts.join(' '),/Sara Ahmed/);
 assert.equal((await db.search({kind:'named'})).total,0); // Never infer a name from adjacent text.
 await c.suppress('sara.ahmed@example.com');assert.equal((await db.search({kind:'uncontacted'})).total,0);
 c.fetcher=async()=>new Response('User-agent: *\nDisallow: /');const blocked=await db.collect(input);assert.equal(blocked.held,1);assert.match(blocked.results[0].reason,/robots/);
 assert.equal((await c.list()).length,0);assert.equal(await c.quota(),0);
});
test('company bulk imports retain source attribution and do not invent people',async()=>{
 const {c}=await setup(),db=c.contacts();const p={provider:'PDL',source_url:'https://docs.peopledatalabs.com/docs/free-company-dataset',attribution:'CC BY 4.0',records:[{name:'Example Power',website:'https://www.example.com',industry:'Electrical',country:'saudi arabia'}]};
 await db.importCompanies(p);await db.importCompanies(p);const result=await db.companies({q:'saudi'});assert.equal(result.total,1);assert.equal(result.items[0].attribution,'CC BY 4.0');assert.equal((await db.search()).total,0);
 await assert.rejects(db.importCompanies({...p,records:[{name:'Bad',website:'https://127.0.0.1'}]}),/public HTTPS/);
 assert.equal((await db.companies({q:"%' OR 1=1 --"})).total,0);
});

test('Ireland and Saudi have independent atomic 25/day quotas (50 total), not a shared cap',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});
 c.fetcher=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\\nAllow: /':html.replaceAll('example.com',new URL(url).hostname),{headers:{'content-type':String(url).endsWith('/robots.txt')?'text/plain':'text/html'}});
 const jobs=[];
 for(let i=1;i<=60;i++){const p=await packet(c,i);p.campaign=i<=30?'ksa-engineering':'ireland-engineering';jobs.push((await c.queue(p)).id);}
 const deliveries=await Promise.allSettled(jobs.map(id=>c.reserve(id)));
 assert.equal(deliveries.filter(r=>r.status==='fulfilled').length,50);
 assert.equal(await c.quota('ksa-engineering'),25);
 assert.equal(await c.quota('ireland-engineering'),25);
 assert.equal(await c.quota(),50);
 const state=await c.status();
 assert.equal(state.quota_by_campaign['ksa-engineering'].remaining,0);
 assert.equal(state.quota_by_campaign['ireland-engineering'].remaining,0);
 assert.equal(state.quota_remaining,0);
});


test('two distinct supported hooks and the exact subject are mandatory',async()=>{
 const {c}=await setup(),p=await packet(c),cv=await c.config('cv');
 assert.throws(()=>validatePacket({...p,subject:'A different subject'},profile,cv),/exact approved/);
 assert.equal(validatePacket({...p,company_fact_secondary:undefined},profile,cv).company_fact_secondary,undefined);
 assert.throws(()=>validatePacket({...p,company_fact_secondary:p.company_fact},profile,cv),/distinct/);
 assert.throws(()=>validatePacket({...p,body:p.body.replace(secondary,'A generic statement')},profile,cv),/two researched/);
 const bad={...p,company_fact_secondary:{...p.company_fact_secondary,source_quote:'An invented commissioning centre in Dublin'}};
 await assert.rejects(verifyEvidence(bad,fetcher),/Second company fact/);
});

async function seedReceipt(c,{campaign,index,status='sent',sentAt=new Date().toISOString(),runId=null}){
 const id=crypto.randomUUID(),d=`test-${campaign}-${index}.com`;
 await c.stmt('INSERT INTO outreach(id,email,domain,company,packet,status,created_at,profile_hash,cv_hash,sent_at,run_id,message_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,'test@'+d,d,'Fixture employer',JSON.stringify({campaign,contact_type:'named_person'}),status,sentAt,'fixture','fixture',status==='sent'?sentAt:null,runId,status==='sent'?crypto.randomUUID().replaceAll('-','').slice(0,16):null).run();
}
const emptyReport={discovered:0,researched:0,queued:999,sent:999,held:0,reasons:[]};
test('25 one-country sends cannot mark the combined daily target complete',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const {run_id}=await c.startRun();
 for(let i=0;i<25;i++)await seedReceipt(c,{campaign:'ksa-engineering',index:i,runId:run_id});
 const r=await c.finishRun(run_id,emptyReport);
 assert.equal(r.sent,25);assert.equal(r.daily_sent,25);assert.equal(r.target_met,false);assert.equal(r.status,'partial');
 assert.deepEqual(r.daily_by_campaign['ireland-engineering'],{sent:0,target:25,remaining:25});
 await assert.rejects(c.finishRun(run_id,emptyReport),/no longer active/);
});
test('daily completion requires 25 actual receipts in each country, including other runs',async()=>{
 const {c}=await setup();const {run_id}=await c.startRun();
 for(const campaign of ['ksa-engineering','ireland-engineering'])for(let i=0;i<25;i++)await seedReceipt(c,{campaign,index:i});
 const r=await c.finishRun(run_id,emptyReport);
 assert.equal(r.sent,0);assert.equal(r.daily_sent,50);assert.equal(r.target_met,true);assert.equal(r.status,'completed');
});
test('queued and uncertain rows do not become successes when sending is paused',async()=>{
 const {c}=await setup();const {run_id}=await c.startRun();
 for(const campaign of ['ksa-engineering','ireland-engineering'])for(let i=0;i<25;i++)await seedReceipt(c,{campaign,index:i,status:i%2?'queued':'needs_reconciliation',runId:run_id});
 const r=await c.finishRun(run_id,emptyReport);
 assert.equal(r.queued,50);assert.equal(r.sent,0);assert.equal(r.daily_sent,0);assert.equal(r.target_met,false);
});
test('finishing after midnight reports the original Riyadh day, never a later day',async()=>{
 const {c}=await setup();const {run_id}=await c.startRun();
 await c.stmt('UPDATE runs SET started_at=? WHERE id=?','2026-01-01T20:59:00.000Z',run_id).run();
 for(const campaign of ['ksa-engineering','ireland-engineering'])for(let i=0;i<25;i++)await seedReceipt(c,{campaign,index:i,sentAt:'2026-01-01T21:00:00.000Z'});
 const r=await c.finishRun(run_id,emptyReport);assert.equal(r.riyadh_date,'2026-01-01');assert.equal(r.daily_sent,0);assert.equal(r.target_met,false);
});

test('official recruitment invitation needs one sufficient original source, no named-person search and supports natural paraphrase',async()=>{
 const {c}=await setup(),p=await packet(c);Object.assign(p,{contact_type:'recruitment_team',contact_name:'Recruitment Team',contact_role:'Recruitment',email:'jobs@example.com',email_source_url:'https://example.com/careers',contact_role_source:'https://example.com/careers',contact_role_quote:'Join our engineering team',contact_email_quote:'For recruitment opportunities, please contact: jobs@example.com',named_search:undefined,company_fact_secondary:undefined,research_review:{...p.research_review,sources:['https://example.com/careers']},company_fact:{statement:'Your substation commissioning work is relevant to my supervised panel experience',source_quote:'The new substation commissioning program has started',source_url:'https://example.com/careers'},body:p.body.replace('Dear Sara','Dear Recruitment Team').replace('The new substation commissioning program has started','Your substation commissioning work is relevant to my supervised panel experience')});
 c.fetcher=async url=>new Response(String(url).endsWith('robots.txt')?'User-agent: *\nAllow: /':html+'<p>Join our engineering team</p><p>For recruitment opportunities, please contact: jobs@example.com</p>',{headers:{'content-type':'text/html'}});
 assert.equal((await c.queue(p)).queued,true);
 await assert.rejects(c.queue({...p,email:'sales@example.com',contact_email_quote:'Our sales contact is sales@example.com'}),/invitation/);
});

test('official corporate email aliases bind to one canonical employer and block second-employee retries',async()=>{
 const {c}=await setup(),p=await packet(c);p.email='sara.ahmed@example.ie';p.contact_email_quote=p.contact_email_quote.replace('@example.com','@example.ie');
 c.fetcher=async url=>new Response(String(url).endsWith('robots.txt')?'User-agent: *\nAllow: /':html.replace('sara.ahmed@example.com','sara.ahmed@example.ie'),{headers:{'content-type':'text/html'}});
 const q=await c.queue(p);assert.ok(q.id);assert.equal(await c.pipeline().canonical('example.ie'),'example.com');
 await assert.rejects(c.pipeline().assertNewEmployer('example.ie','other@example.ie'),/duplicate/);
 assert.throws(()=>validatePacket({...p,email_source_url:'https://unrelated.com/contact'},profile,{sha256:p.cv_sha256}),/alias/);
});

test('historic Gmail receipts missing from outreach suppress employers without creating phantom deliveries',async()=>{
 const {c}=await setup();const history={company:'Old Employer',company_domain:'example.com',email:'old@example.com',message_id:'1000000000000099',sent_at:'2026-01-01T00:00:00.000Z',subject:'Previous application',status:'sent'};
 await c.pipeline().importHistory({records:[history]});await c.pipeline().importHistory({records:[history]});
 assert.equal((await c.pipeline().status()).historical_receipts,1);assert.equal((await c.list()).length,0);assert.equal(await c.quota(),0);
 await assert.rejects(c.queue(await packet(c)),/provider history/);
 await assert.rejects(c.pipeline().importHistory({records:[{...history,email:'someone@other.com',company_domain:'other.com'}]}),/conflicts/);
});

test('confirmed provider IDs cannot be reused across two outreach rows',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});c.fetcher=async url=>new Response(String(url).endsWith('robots.txt')?'User-agent: *\nAllow: /':html.replaceAll('example.com',new URL(url).hostname),{headers:{'content-type':'text/html'}});
 const one=await c.reserve((await c.queue(await packet(c,1))).id),two=await c.reserve((await c.queue(await packet(c,2))).id);
 await c.receipt({reservation_token:one.reservation_token,message_id:'1000000000000001'});
 await assert.rejects(c.receipt({reservation_token:two.reservation_token,message_id:'1000000000000001'}),/already assigned/);
 const state=await c.status();assert.equal(state.successful_delivery_by_campaign['ksa-engineering'].sent,1);
});

test('bounce feedback reduces successful totals while preserving provider history and send quota',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c)),r=await c.reserve(q.id);await c.receipt({reservation_token:r.reservation_token,message_id:'1000000000000001'});
 await c.feedback({id:q.id,kind:'bounce',message_id:'2000000000000001',received_at:new Date().toISOString(),summary:'Remote server rejected the recipient with 550 5.4.1.'});
 assert.equal(await c.quota(),1);assert.equal((await c.status()).successful_delivery_by_campaign['ksa-engineering'].sent,0);assert.equal((await c.list())[0].message_id,'1000000000000001');
});

test('50-record production-path fault injection has no duplicate sends or phantom receipts after interruption',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});c.fetcher=async url=>new Response(String(url).endsWith('robots.txt')?'User-agent: *\nAllow: /':html.replaceAll('example.com',new URL(url).hostname),{headers:{'content-type':'text/html'}});
 const providerAccepted=new Map(),reservations=[];
 for(let i=1;i<=50;i++){const p=await packet(c,i);p.campaign=i<=25?'ireland-engineering':'ksa-engineering';const q=await c.queue(p),r=await c.reserve(q.id);reservations.push(r);providerAccepted.set(q.id,(0x1000000000000000n+BigInt(i)).toString(16));if(i%10!==0)await c.receipt({reservation_token:r.reservation_token,message_id:providerAccepted.get(q.id)});}
 assert.equal(providerAccepted.size,50);assert.equal((await c.pipeline().status()).campaigns['ireland-engineering'].delivered_today,23);assert.equal((await c.pipeline().status()).campaigns['ksa-engineering'].delivered_today,22);
 await c.stmt("UPDATE outreach SET reserved_at='2020-01-01T00:00:00.000Z' WHERE status='sending'").run();const recovery=await c.pipeline().recover();assert.equal(recovery.quarantined,5);
 const pending=(await c.list()).filter(row=>row.status==='needs_reconciliation');assert.equal(pending.length,5);
 for(const row of pending){await assert.rejects(c.reserve(row.id),/unknown/);await c.receipt({reservation_token:row.reservation_token,message_id:providerAccepted.get(row.id),sent_at:new Date().toISOString()});}
 // Reconciliation associates existing provider receipts; it never calls the mock provider again.
 assert.equal(providerAccepted.size,50);assert.equal((await c.list()).filter(row=>row.message_id).length,50);assert.equal(new Set((await c.list()).map(row=>row.message_id)).size,50);assert.equal((await c.status()).successful_delivery_by_campaign['ireland-engineering'].sent,25);assert.equal((await c.status()).successful_delivery_by_campaign['ksa-engineering'].sent,25);
});

test('research leases recover independently, retries are bounded and evidence failures stop',async()=>{
 const {c}=await setup();const p={domain:'newco.com',company:'New Company',campaign:'ireland-engineering',stage:'DISCOVER',research:{specialty:'Control panels'}};await c.pipeline().checkpoint(p);
 const batch=await c.pipeline().claim({limit:3});assert.equal(batch.items.length,1);assert.equal((await c.pipeline().claim({limit:3})).items.length,0);
 const first=batch.items[0];await c.pipeline().fail({domain:p.domain,lease_token:first.lease_token,error:'HTTP 503 upstream unavailable'});assert.equal((await c.pipeline().claim({limit:3})).items.length,0);
 await c.stmt('UPDATE employer_pipeline SET next_attempt_at=NULL').run();const next=(await c.pipeline().claim()).items[0];const held=await c.pipeline().fail({domain:p.domain,lease_token:next.lease_token,error:'No published recruitment address; evidence unsuitable'});assert.equal(held.retry,false);assert.equal((await c.pipeline().claim()).items.length,0);
 await c.pipeline().checkpoint({...p,domain:'another.com'});const other=(await c.pipeline().claim()).items[0];await c.stmt("UPDATE employer_pipeline SET lease_until='2020-01-01T00:00:00.000Z' WHERE canonical_domain='another.com'").run();assert.equal((await c.pipeline().recover()).recovered,1);assert.equal((await c.pipeline().claim()).items.length,1);
});

test('Riyadh midnight boundaries and digit-first corporate DNS are valid without allowing IP sources',async()=>{
 const {riyadhDayStart}=await import('../lib/career.mjs');assert.equal(riyadhDayStart(Date.parse('2026-10-28T20:59:59.999Z')),'2026-10-27T21:00:00.000Z');assert.equal(riyadhDayStart(Date.parse('2026-10-28T21:00:00.000Z')),'2026-10-28T21:00:00.000Z');
 assert.equal(sourceURL('https://01electronics.net/careers').hostname,'01electronics.net');for(const url of ['https://127.0.0.1','https://0x7f000001','https://2130706433','https://[::1]'])assert.throws(()=>sourceURL(url));
});

test('public Cloudflare email encoding supplies exact browser-visible address and preserves context',()=>{
 const email='jobs@example.com',key=83,encoded=key.toString(16).padStart(2,'0')+[...new TextEncoder().encode(email)].map(value=>(value^key).toString(16).padStart(2,'0')).join('');
 const source=extractPublicSource(`<p>Send your CV to <a class="__cf_email__" data-cfemail="${encoded}" href="/cdn-cgi/l/email-protection">[email protected]</a>.</p><div hidden><span data-cfemail="${encoded}">Hidden</span></div>`,'https://example.com/careers');
 assert.equal(source.text,'Send your CV to jobs@example.com.');assert.equal(source.contacts.length,1);assert.equal(source.contacts[0].publication,'public_cloudflare_encoding');assert.ok(source.contacts[0].contexts[0].includes('Send your CV'));
});

test('history reconciled after queueing blocks a send reservation',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c));await c.pipeline().importHistory({records:[{company:'Example Power',company_domain:'example.com',email:'other@example.com',message_id:'1000000000000099',sent_at:'2026-01-01T00:00:00.000Z',subject:'Old application'}]});
 await assert.rejects(c.reserve(q.id),/provider history/);assert.equal(await c.quota(),0);
});

test('concurrent corporate-alias queueing commits only one employer and leaves no orphan outreach',async()=>{
 const {c}=await setup(),one=await packet(c,1),two=await packet(c,2);
 for(const [p,email] of [[one,'first@shared.example'],[two,'second@shared.example']]){p.email=email;p.contact_email_quote='Sara Ahmed — Engineering Manager. Email: '+email;}
 c.fetcher=async url=>new Response(String(url).endsWith('robots.txt')?'User-agent: *\nAllow: /':html+'<p>Sara Ahmed — Engineering Manager. Email: first@shared.example</p><p>Sara Ahmed — Engineering Manager. Email: second@shared.example</p>',{headers:{'content-type':'text/html'}});
 const results=await Promise.allSettled([c.queue(one),c.queue(two)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await c.list()).length,1);
 const alias=await c.pipeline().canonical('shared.example');assert.equal((await c.list())[0].domain,alias);
 assert.equal((await c.stmt('SELECT COUNT(*) n FROM employer_pipeline').first()).n,1);
});

test('research concurrency cap applies across concurrent claim requests',async()=>{
 const {c}=await setup();for(let i=0;i<10;i++)await c.pipeline().checkpoint({domain:`prospect${i}.com`,company:'Fixture employer',campaign:i%2?'ireland-engineering':'ksa-engineering',stage:'DISCOVER'});
 const batches=await Promise.all([c.pipeline().claim({limit:5}),c.pipeline().claim({limit:5}),c.pipeline().claim({limit:5})]);
 assert.equal(batches.reduce((n,b)=>n+b.items.length,0),3);
 assert.equal((await c.stmt('SELECT COUNT(*) n FROM employer_pipeline WHERE lease_token IS NOT NULL').first()).n,3);
});

test('checkpoint cannot overwrite a competing research lease acquired after its first read',async()=>{
 const {c}=await setup(),p={domain:'race.com',company:'Race fixture',campaign:'ireland-engineering',stage:'RESEARCH'};await c.pipeline().checkpoint(p);
 const original=c.stmt.bind(c),winner=crypto.randomUUID();let injected=false;
 c.stmt=(sql,...args)=>{if(!injected&&sql.startsWith('INSERT INTO employer_pipeline')){injected=true;original('UPDATE employer_pipeline SET lease_token=?,lease_until=? WHERE canonical_domain=?',winner,new Date(Date.now()+60000).toISOString(),p.domain).run();}return original(sql,...args);};
 await assert.rejects(c.pipeline().checkpoint(p),/another research worker/);
 assert.equal((await original('SELECT lease_token FROM employer_pipeline WHERE canonical_domain=?',p.domain).first()).lease_token,winner);
});

test('historical receipt import rejects conflicting rows in one batch and legacy provider IDs are guarded',async()=>{
 const {c}=await setup(),h={company:'Historical fixture',company_domain:'old.com',email:'one@old.com',message_id:'1000000000000099',sent_at:'2026-01-01T00:00:00.000Z',subject:'Old application'};
 await assert.rejects(c.pipeline().importHistory({records:[h,{...h,email:'two@other.com',company_domain:'other.com'}]}),/conflicts/);
 assert.equal((await c.pipeline().status()).historical_receipts,0);
 await seedReceipt(c,{campaign:'ireland-engineering',index:1});const old=(await c.list())[0];
 await seedReceipt(c,{campaign:'ksa-engineering',index:2,status:'needs_reconciliation'});const other=(await c.list()).find(r=>r.id!==old.id);
 assert.throws(()=>c.stmt('UPDATE outreach SET message_id=? WHERE id=?',old.message_id,other.id).run(),/already assigned/);
 await assert.rejects(c.pipeline().importHistory({records:[{...h,message_id:old.message_id}]}),/conflicts/);
});

test('qualified inventory excludes old candidate snapshots and expired research reviews',async()=>{
 const {c}=await setup(),q=await c.queue(await packet(c));
 assert.equal((await c.pipeline().status()).campaigns['ksa-engineering'].qualified_unsent,1);
 await c.setProfile({...profile,evidence:[...profile.evidence,{id:'newfact',claim:'A newly approved candidate fact.'}]});
 assert.equal((await c.pipeline().status()).campaigns['ksa-engineering'].qualified_unsent,0);
 await c.setProfile(profile);const old=JSON.parse((await c.list())[0].packet);old.research_review.checked_at='2020-01-01T00:00:00.000Z';await c.stmt('UPDATE outreach SET packet=? WHERE id=?',JSON.stringify(old),q.id).run();
 assert.equal((await c.pipeline().status()).campaigns['ksa-engineering'].qualified_unsent,0);
});

test('additive pipeline migration preserves existing configuration, events and provider receipts',()=>{
 const db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')&&x<'0010_').sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));
 db.prepare('INSERT INTO configuration(key,value) VALUES(?,?)').run('cv','{"sha256":"approved-private-fixture"}');
 db.prepare('INSERT INTO events(at,kind,detail) VALUES(?,?,?)').run('2026-01-01T00:00:00.000Z','sent','{"outreach_id":"legacy"}');
 db.prepare('INSERT INTO outreach(id,email,domain,company,packet,status,created_at,profile_hash,cv_hash,message_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run('legacy','recipient@legacy.com','legacy.com','Legacy employer','{}','sent','2026-01-01T00:00:00.000Z','old-profile','old-cv','1000000000000001');
 db.prepare('INSERT INTO tenant_accounts(id,created_at,last_seen_at) VALUES(?,?,?)').run('existing-tenant','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
 db.prepare('INSERT INTO tenant_profiles(tenant_id,data,updated_at) VALUES(?,?,?)').run('existing-tenant','{\"name\":\"Tenant fixture\"}','2026-01-01T00:00:00.000Z');
 db.exec(fs.readFileSync('drizzle/0010_durable_pipeline.sql','utf8').replaceAll('--> statement-breakpoint',''));
 assert.equal(db.prepare('SELECT message_id FROM outreach WHERE id=?').get('legacy').message_id,'1000000000000001');assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n,1);assert.equal(JSON.parse(db.prepare('SELECT value FROM configuration WHERE key=?').get('cv').value).sha256,'approved-private-fixture');
 assert.equal(JSON.parse(db.prepare('SELECT data FROM tenant_profiles WHERE tenant_id=?').get('existing-tenant').data).name,'Tenant fixture');
 assert.throws(()=>db.prepare('INSERT INTO outreach(id,email,domain,company,packet,status,created_at,profile_hash,cv_hash,message_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run('duplicate','recipient@new.com','new.com','New employer','{}','sent','2026-01-02T00:00:00.000Z','profile','cv','1000000000000001'),/already assigned/);
 db.close();
});

test('bounded source reads respect per-origin politeness and settle independent failures',async()=>{
 const {mapBounded}=await import('../lib/worker-utils.mjs');const perOrigin=new Map();let active=0,peak=0;
 const urls=['https://one.example/a','https://one.example/b','https://two.example/a','https://three.example/a','https://three.example/b'];
 const result=await mapBounded(urls,3,async url=>{const origin=new URL(url).origin;assert.equal(perOrigin.get(origin)||0,0);perOrigin.set(origin,1);active++;peak=Math.max(peak,active);try{await new Promise(resolve=>setTimeout(resolve,5));if(origin==='https://two.example')throw Error('Independent fetch failed');return url;}finally{active--;perOrigin.set(origin,0);}},url=>new URL(url).origin);
 assert.equal(peak,3);assert.equal(result.filter(r=>r.status==='fulfilled').length,4);assert.equal(result[2].status,'rejected');assert.equal(result[1].value,urls[1]);assert.equal(active,0);
});

// D1 reports total_changes(), including writes performed by pipeline triggers.
// Keep the adapter above faithful so this cannot regress behind SQLite changes().
test('D1 trigger writes count twice but reservation returns the one guarded outreach row',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c));
 const change=await c.stmt("UPDATE outreach SET status='queued' WHERE id=?",q.id).run();assert.equal(change.meta.changes,2);
 const r=await c.reserve(q.id);assert.ok(r.payload.parts[1].body.base64_url_content);
 assert.equal((await c.stmt('SELECT stage FROM employer_pipeline WHERE outreach_id=?',q.id).first()).stage,'SEND');
 await c.uncertain(r.reservation_token,'Timeout after Gmail request');
 await assert.rejects(c.reserve(q.id),/processed|unknown/);assert.equal(await c.quota(),1);
});
async function unissued(c,number=0){
 const q=await c.queue(await packet(c,number)),token=crypto.randomUUID();
 await c.stmt("UPDATE outreach SET status='needs_reconciliation',reservation_token=?,reserved_at=?,last_error=? WHERE id=?",token,new Date().toISOString(),'prepare_delivery returned INVALID_ARGUMENT without a usable Gmail payload. No Gmail send was attempted.',q.id).run();
 const d=number?'company'+number+'.com':'example.com';
 return {q,token,proof:{id:q.id,gmail_checked_at:new Date().toISOString(),gmail_query:'in:sent {to:sara.ahmed@'+d+' to:'+d+'}',gmail_sent_match_count:0}};
}
test('unissued payload recovery releases only proven unused quota and requires fresh research',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const {q,proof}=await unissued(c);
 assert.equal(await c.quota(),1);assert.equal((await c.releaseUnissuedReservation(proof)).fresh_research_required,true);
 assert.equal(await c.quota(),0);assert.equal((await c.list())[0].status,'cancelled');
 const state=await c.stmt('SELECT * FROM employer_pipeline WHERE canonical_domain=?','example.com').first();assert.equal(state.stage,'VERIFY');assert.equal(state.outreach_id,null);
 assert.equal((await c.releaseUnissuedReservation(proof)).already_released,true);
 await assert.rejects(c.reserve(q.id),/processed/);assert.equal((await c.queue(await packet(c))).queued,true);
});
test('issued payloads and actual ambiguous Gmail sends never qualify for release',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c)),r=await c.reserve(q.id);
 await c.uncertain(r.reservation_token,'No Gmail send was attempted; prepare payload was lost after return');
 const proof={id:q.id,gmail_checked_at:new Date().toISOString(),gmail_query:'in:sent {to:sara.ahmed@example.com to:example.com}',gmail_sent_match_count:0};
 await assert.rejects(c.releaseUnissuedReservation(proof),/Payload issuance/);assert.equal(await c.quota(),1);
 const {c:otherCareer}=await setup();const other=await unissued(otherCareer);await otherCareer.stmt('UPDATE outreach SET last_error=? WHERE id=?','Gmail send failed HTTP 403',other.q.id).run();
 await assert.rejects(otherCareer.releaseUnissuedReservation(other.proof),/ambiguous delivery/);
});
test('release rejects stale or unrelated Gmail checks and reconciled provider evidence',async()=>{
 const {c}=await setup();const {q,proof}=await unissued(c);
 await assert.rejects(c.releaseUnissuedReservation({...proof,gmail_checked_at:new Date(Date.now()-360000).toISOString()}),/Fresh Gmail/);
 await assert.rejects(c.releaseUnissuedReservation({...proof,gmail_query:'in:sent to:unrelated.com'}),/cover recipient/);
 await c.pipeline().importHistory({records:[{company:'Example Power',company_domain:'example.com',email:'other@example.com',message_id:'1000000000000001',sent_at:new Date().toISOString(),subject:'Earlier contact'}]});
 await assert.rejects(c.releaseUnissuedReservation(proof),/provider evidence/);assert.equal((await c.list()).find(x=>x.id===q.id).status,'needs_reconciliation');
});
test('stale-reservation recovery counts outreach rows once despite pipeline trigger writes',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const q=await c.queue(await packet(c)),r=await c.reserve(q.id);
 await c.stmt('UPDATE outreach SET reserved_at=? WHERE id=?',new Date(Date.now()-20*60000).toISOString(),q.id).run();
 assert.equal((await c.pipeline().recover()).quarantined,1);assert.equal((await c.pipeline().recover()).quarantined,0);
 assert.equal((await c.list())[0].reservation_token,r.reservation_token);
});
