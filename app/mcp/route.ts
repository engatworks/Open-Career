import { env } from 'cloudflare:workers';
import { Career } from '@/lib/career.mjs';
import { MVPWorkflow } from '@/lib/mvp-workflow.mjs';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'};
const tools=[
 {name:'mvp_consent_status',description:'Read your personal Open Career consent and versioned terms. Only signed-in owner can access.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'mvp_check_permission',description:'Check a specific Open Career scope before acting; this does NOT grant external Gmail/browser privileges.',inputSchema:object({scope:str},['scope']),annotations:{readOnlyHint:true}},
 {name:'mvp_list_applications',description:'Read your private job applications and evidence. Requires research:read consent.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'mvp_prepare_application',description:'Idempotently prepare a job application; DOES NOT open websites or submit. Requires applications:prepare consent and current CV.',inputSchema:object({companyDomain:str,atsJobId:str,vacancyUrl:str,positionTitle:str},['companyDomain','vacancyUrl','positionTitle'])},
 {name:'mvp_record_application_result',description:'Record only ATTEMPTED, SUBMITTED_UNVERIFIED, REQUIRES_USER or FAILED; no self-declared confirmation. Requires action scope.',inputSchema:object({id:str,state:{type:'string',enum:['attempted','submitted_unverified','requires_user','failed']},evidence:{type:'object'}},['id','state'])},
 {name:'mvp_portal_accounts',description:'List portal account references. No passwords are stored. Requires research:read consent.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'mvp_register_portal_account',description:'Record an externally CREATED portal account reference. Does not create login or accept passwords. Requires accounts:create consent.',inputSchema:object({portalUrl:str,loginEmail:str},['portalUrl','loginEmail'])},

 {name:'search_contact_database',description:'Search durable contact candidates. Imported names are claims; no result grants delivery eligibility.',inputSchema:object({q:str,domain:str,kind:str,offset:{type:'integer'},limit:{type:'integer'}}),annotations:{readOnlyHint:true}},
 {name:'contact_evidence',description:'Read original/provider observations for one contact and review identity conflicts.',inputSchema:object({email:str},['email']),annotations:{readOnlyHint:true}},
 {name:'collect_contact_sources',description:'Collect exact published email candidates from up to five selected public pages, respecting robots and limits. Saves source contexts; does not send or infer identities.',inputSchema:object({urls:{type:'array',items:str,maxItems:5,minItems:1}},['urls'])},
 {name:'import_contact_candidates',description:'Import up to 100 authorized provider contact records. Records remain unverified; guessed/inferred addresses are rejected.',inputSchema:object({provider:str,source_url:str,csv:str,records:{type:'array',items:{type:'object'},maxItems:100}},['provider'])},
 {name:'search_company_inventory',description:'Search the persistent company discovery database; results are not proof of hiring or Saudi branch presence.',inputSchema:object({q:str,offset:{type:'integer'}}),annotations:{readOnlyHint:true}},
 {name:'import_company_inventory',description:'Import up to 100 permitted company dataset rows, retaining attribution and source.',inputSchema:object({provider:str,source_url:str,attribution:str,csv:str,records:{type:'array',items:{type:'object'},maxItems:100}},['provider','source_url'])},

 {name:'career_status',description:'Read private setup, actual outreach counts, daily quota and cloud-run history.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'career_context',description:'Read approved candidate evidence, CV fingerprint and durable workflow instructions; optionally retrieve the exact PDF as base64url for Gmail attachment.',inputSchema:object({include_cv:{type:'boolean'}}),annotations:{readOnlyHint:true}},
 {name:'list_outreach',description:'Read durable company/contact history before researching or sending. Includes queued/sent/unknown records.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'inspect_public_source',description:'Read one public HTML or text PDF source, respecting robots policy, and return published email candidates with original context and links. Candidates are not verified identities. Never infer an address.',inputSchema:object({url:str},['url']),annotations:{readOnlyHint:true}},
 {name:'company_research_plan',description:'Generate bilingual named-person research queries for a company domain; no paid database or vacancy is required.',inputSchema:object({domain:str},['domain']),annotations:{readOnlyHint:true}},
 {name:'record_employer',description:'Save original source research or a concrete hold reason; candidate data must remain private.',inputSchema:object({domain:str,company:str,website:str,status:str,reason:str,research:{type:'object'}},['domain','company'])},
 {name:'start_research_run',description:'Claim the single cloud research worker; returns run_id. Do this before researching.',inputSchema:object({kind:str})},
 {name:'heartbeat_research_run',description:'Refresh the active run lease during extended research.',inputSchema:object({run_id:str},['run_id'])},
 {name:'record_recipient_feedback',description:'Record actual Gmail reply, decline or bounce evidence. Declines/bounces suppress further contact.',inputSchema:object({id:str,kind:{type:'string',enum:['reply','decline','bounce']},message_id:str,received_at:str,summary:str},['id','kind','message_id','received_at','summary'])},
 {name:'queue_verified_outreach',description:'Re-fetch source evidence, freeze candidate/CV fingerprints and queue one deeply researched message. Requires a published named-person email or an official careers inbox explicitly inviting applications, plus a supported company fact. Read career_context for the packet contract.',inputSchema:object({packet:{type:'object'},run_id:str},['packet'])},
 {name:'prepare_delivery',description:'Reserve one queued message and rolling quota. Returns exact Gmail multipart payload with CV.pdf; send it once through Gmail, then record the actual provider receipt. Never re-call after an ambiguous send.',inputSchema:object({id:str},['id'])},
 {name:'record_delivery',description:'Record actual Gmail message and thread IDs after confirmed delivery; cannot fabricate a receipt or retry a send.',inputSchema:object({reservation_token:str,message_id:str,thread_id:str},['reservation_token','message_id'])},
 {name:'hold_uncertain_delivery',description:'Quarantine any ambiguous or safety-blocked send. It remains counted and is never retried automatically.',inputSchema:object({reservation_token:str,reason:str},['reservation_token','reason'])},
 {name:'suppress_contact',description:'Permanently suppress an actual declining recipient and cancel their queued message.',inputSchema:object({email:str,reason:str},['email'])},
 {name:'record_reply',description:'Mark an actual later recipient reply verified in the outgoing Gmail thread.',inputSchema:object({id:str},['id'])},
 {name:'finish_research_run',description:'Finish a run with evidence and hold reasons. Queued/sent counts are computed from stored records, not trusted from prose.',inputSchema:object({run_id:str,report:{type:'object'}},['run_id','report'])},
];
export async function POST(request:Request){let rpc:any;try{if(Number(request.headers.get('content-length')||0)>200000)throw Error('MCP input too large');rpc=await request.json();if(!rpc||rpc.jsonrpc!=='2.0')throw Error('Invalid JSON-RPC request');
 if(rpc.method==='server/discover')return Response.json({jsonrpc:'2.0',id:rpc.id,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{}}}});
 if(rpc.method==='initialize')return Response.json({jsonrpc:'2.0',id:rpc.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'Open Career',version:'0.5.0'}}});
 if(rpc.method==='tools/list')return Response.json({jsonrpc:'2.0',id:rpc.id,result:{tools}});
 if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
 if(rpc.method!=='tools/call')throw Error('Unknown method');
 const c=new Career(env),a=rpc.params?.arguments||{};let result;
 const newNames=new Set(['mvp_consent_status','mvp_check_permission','mvp_list_applications','mvp_prepare_application','mvp_record_application_result','mvp_portal_accounts','mvp_register_portal_account']);
 let mvp;
 if(newNames.has(rpc.params?.name)){
  const signedIn=await getChatGPTUser();
  if(!signedIn?.userId)throw Error('Sign in with ChatGPT is required for private MVP application tools');
  mvp=new MVPWorkflow(env.DB,signedIn.userId);
 }

 switch(rpc.params?.name){
 case'mvp_consent_status':result=await mvp.status();break;
 case'mvp_check_permission':result=await mvp.permission(a.scope);break;
 case'mvp_list_applications':result={items:await mvp.applications()};break;
 case'mvp_prepare_application':result=await mvp.prepare(a,(await c.config('cv'))?.sha256||'');break;
 case'mvp_record_application_result':result=await mvp.result(a);break;
 case'mvp_portal_accounts':result={items:await mvp.accounts()};break;
 case'mvp_register_portal_account':result=await mvp.registerAccount(a);break;
 case'search_contact_database':result=await c.contacts().search(a);break;case'contact_evidence':result=await c.contacts().detail(a.email);break;case'collect_contact_sources':result=await c.contacts().collect(a);break;case'import_contact_candidates':result=await c.contacts().import(a);break;case'search_company_inventory':result=await c.contacts().companies(a);break;case'import_company_inventory':result=await c.contacts().importCompanies(a);break;case'career_status':result=await c.status();break;case'career_context':result=await c.context(a.include_cv===true);break;case'list_outreach':result={items:await c.list()};break;case'inspect_public_source':result=await c.inspectSource(a.url);break;case'company_research_plan':result=c.researchPlan(a.domain);break;case'record_employer':result=await c.recordLead(a);break;case'start_research_run':result=await c.startRun(a.kind);break;case'heartbeat_research_run':result=await c.heartbeat(a.run_id);break;case'record_recipient_feedback':result=await c.feedback(a);break;case'queue_verified_outreach':result=await c.queue(a.packet,a.run_id);break;case'prepare_delivery':result=await c.reserve(a.id);break;case'record_delivery':result=await c.receipt(a);break;case'hold_uncertain_delivery':result=await c.uncertain(a.reservation_token,a.reason);break;case'suppress_contact':result=await c.suppress(a.email,a.reason);break;case'record_reply':result=await c.reply(a.id);break;case'finish_research_run':result=await c.finishRun(a.run_id,a.report);break;default:throw Error('Unknown tool');}
 return Response.json({jsonrpc:'2.0',id:rpc.id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false}},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return Response.json({jsonrpc:'2.0',id:rpc?.id??null,result:{content:[{type:'text',text:error instanceof Error?error.message:'Action failed'}],isError:true}},{headers:{'Cache-Control':'private, no-store'}});}}
