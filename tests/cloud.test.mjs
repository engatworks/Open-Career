import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { Career, hash, validatePacket, visibleText, verifyEvidence, sourceURL, inspectSource } from '../lib/career.mjs';
import { extractPublicSource } from '../lib/public-source.mjs';

class D1 {
 constructor(){this.db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())this.db.exec(fs.readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));}
 prepare(sql){const db=this.db;let values=[];const api={bind(...a){values=a;return api;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}};return api;}
 async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());this.db.exec('COMMIT');return results;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
class Bucket{constructor(){this.values=new Map();}async put(key,bytes){this.values.set(key,new Uint8Array(bytes));}async get(key){const data=this.values.get(key);return data?{arrayBuffer:async()=>data.slice().buffer}:null;}}
const profile={name:'Test Candidate',target_roles:['Junior Electrical Engineer'],evidence:[{id:'panels',claim:'Assisted with supervised control-panel assembly and testing.'}]};
const html='<p>Sara Ahmed — Engineering Manager. Email: sara.ahmed@example.com</p><p>The new substation commissioning program has started.</p><p>The relay testing phase includes supervised acceptance checks.</p>';
const fetcher=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':html,{headers:{'content-type':String(url).endsWith('/robots.txt')?'text/plain':'text/html'}});
async function setup(){const c=new Career({DB:new D1(),BUCKET:new Bucket()},fetcher);await c.setProfile(profile);const cv=new TextEncoder().encode('%PDF-1.4 test');await c.uploadCV(cv);await c.saveConfig('verification',{background_send:true,attachment_sha256:await hash(cv)});return {c,cv};}
async function packet(c,number=0){const cv=await c.config('cv');const d=number?'company'+number+'.com':'example.com';return {named_search:{queries:['site:'+d+' engineering manager'],sources:['https://'+d+'/team'],outcome:'Original team page binds the engineering manager to the individual work email.'},research_review:{company_review:'Original company source describes a substation commissioning program relevant to supervised junior panel support.',person_review:'Sara Ahmed is listed as Engineering Manager on the official team page together with the exact individual work email.',selection_reason:'Engineering work is relevant to junior panel assembly and testing support.',checked_at:new Date().toISOString(),sources:['https://'+d+'/team','https://'+d+'/news'],conflict_queries:['Sara Ahmed Example Power current employer'],conflict_outcome:'Reviewed current original team page; no conflicting employment evidence found.',unresolved_conflict:false,limitations:'No vacancy or mailbox deliverability independently established.'},company:'Example Power',company_domain:d,contact_name:'Sara Ahmed',contact_role:'Engineering Manager',email:'sara.ahmed@'+d,email_evidence:'exact_published',email_source_url:'https://'+d+'/team',contact_role_source:'https://'+d+'/team',contact_role_quote:'Sara Ahmed — Engineering Manager',contact_email_quote:'Sara Ahmed — Engineering Manager. Email: sara.ahmed@'+d,company_fact:{statement:'The new substation commissioning program has started',source_quote:'The new substation commissioning program has started',source_url:'https://'+d+'/news'},company_fact_secondary:{statement:'The relay testing phase includes supervised acceptance checks',source_quote:'The relay testing phase includes supervised acceptance checks',source_url:'https://'+d+'/services'},personalization_reason:'Published commissioning activity matches supervised panel experience',candidate_fact_ids:['panels'],subject:'I have nothing to offer, but I want in',body:'Dear Sara,\n\nThe new substation commissioning program has started, and this work caught my attention because of its relevance to electrical commissioning. The relay testing phase includes supervised acceptance checks. I assisted with supervised control-panel assembly and testing. I am seeking a paid junior electrical engineering position and would appreciate an opportunity to discuss how this background may support the team. My CV is attached for your consideration, and I would be grateful for an introduction to the colleague responsible for suitable vacancies.\n\nKind regards,\nTest Candidate',cv_sha256:cv.sha256};}

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
 assert.throws(()=>validatePacket({...p,named_search:undefined,contact_type:'recruitment_team'},profile,cv),/named people first/);
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
 assert.throws(()=>validatePacket({...p,named_search:undefined},profile,cv),/named people first/);
});
test('legacy packets lacking research review cannot reserve delivery',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});const p=await packet(c),q=await c.queue(p);delete p.research_review;await c.stmt('UPDATE outreach SET packet=? WHERE id=?',JSON.stringify(p),q.id).run();await assert.rejects(c.reserve(q.id));assert.equal(await c.quota(),0);assert.equal((await c.list())[0].status,'queued');
});

const { textPDF } = await import('./pdf-fixture.mjs');
const pdfFetch = bytes => async url => String(url).endsWith('/robots.txt')
 ? new Response('User-agent: *\nAllow: /') : new Response(bytes, {headers:{'content-type':'application/pdf'}});

test('official PDF evidence supports inspection, queue and fresh reservation without changing CV',async()=>{
 const bytes=textPDF([['Sara Ahmed - Engineering Manager. Email: sara.ahmed@example.com','The new substation commissioning program has started.']]);
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
 c.fetcher=pdfFetch(textPDF([[p.contact_email_quote,p.company_fact.source_quote]]));
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

test('25 confirmed Saudi sends with zero Ireland is partial despite legacy daily_target=25',async()=>{
 const {c}=await setup();await c.setSettings({live_send_enabled:true});
 c.fetcher=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\\nAllow: /':html.replaceAll('example.com',new URL(url).hostname),{headers:{'content-type':String(url).endsWith('/robots.txt')?'text/plain':'text/html'}});
 const {run_id}=await c.startRun('daily-25-plus-25');
 for(let i=1;i<=25;i++){
  const p=await packet(c,i);p.campaign='ksa-engineering';
  const q=await c.queue(p,run_id),reserved=await c.reserve(q.id);
  await c.receipt({reservation_token:reserved.reservation_token,message_id:i.toString(16).padStart(16,'0')});
 }
 const report=await c.finishRun(run_id,{discovered:25,researched:25,queued:25,sent:25,held:0,reasons:[]});
 assert.equal(report.daily_sent,25);
 assert.equal(report.daily_by_campaign['ksa-engineering'].sent,25);
 assert.equal(report.daily_by_campaign['ireland-engineering'].sent,0);
 assert.equal(report.daily_by_campaign['ireland-engineering'].available_reservations,25);
 assert.equal(report.target_met,false);
 assert.equal(report.status,'partial');
});
test('country-campaign owner subject cannot drift',async()=>{
 const {c}=await setup(),p=await packet(c),cv=await c.config('cv');
 assert.throws(()=>validatePacket({...p,subject:'Generic vacancy question'},profile,cv),/exact approved subject/);
});

test('second employer-specific statement is mandatory and must match original source',async()=>{
 const {c}=await setup(),p=await packet(c),cv=await c.config('cv');
 const missing={...p};delete missing.company_fact_secondary;
 assert.throws(()=>validatePacket(missing,profile,cv));
 const invented={...p,company_fact_secondary:{...p.company_fact_secondary,statement:'Invented secondary project detail',source_quote:'Invented secondary project detail'},body:p.body.replace('The relay testing phase includes supervised acceptance checks','Invented secondary project detail')};
 await assert.rejects(c.queue(invented),/Secondary company fact source quote not found/);
 assert.equal((await c.queue(p)).queued,true);
});
