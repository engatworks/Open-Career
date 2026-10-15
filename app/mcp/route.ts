import { env } from 'cloudflare:workers';
import { Career } from '@/lib/career.mjs';
export const dynamic='force-dynamic';
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'};
const tools=[
 {name:'career_status',description:'Read private setup, actual outreach counts, daily quota and cloud-run history.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'career_context',description:'Read approved candidate evidence, CV fingerprint and durable workflow instructions; optionally retrieve the exact PDF as base64url for Gmail attachment.',inputSchema:object({include_cv:{type:'boolean'}}),annotations:{readOnlyHint:true}},
 {name:'list_outreach',description:'Read durable company/contact history before researching or sending. Includes queued/sent/unknown records.',inputSchema:object({}),annotations:{readOnlyHint:true}},
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
 if(rpc.method==='initialize')return Response.json({jsonrpc:'2.0',id:rpc.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'Open Career',version:'0.3.1'}}});
 if(rpc.method==='tools/list')return Response.json({jsonrpc:'2.0',id:rpc.id,result:{tools}});
 if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
 if(rpc.method!=='tools/call')throw Error('Unknown method');
 const c=new Career(env),a=rpc.params?.arguments||{};let result;
 switch(rpc.params?.name){case'career_status':result=await c.status();break;case'career_context':result=await c.context(a.include_cv===true);break;case'list_outreach':result={items:await c.list()};break;case'record_employer':result=await c.recordLead(a);break;case'start_research_run':result=await c.startRun(a.kind);break;case'heartbeat_research_run':result=await c.heartbeat(a.run_id);break;case'record_recipient_feedback':result=await c.feedback(a);break;case'queue_verified_outreach':result=await c.queue(a.packet,a.run_id);break;case'prepare_delivery':result=await c.reserve(a.id);break;case'record_delivery':result=await c.receipt(a);break;case'hold_uncertain_delivery':result=await c.uncertain(a.reservation_token,a.reason);break;case'suppress_contact':result=await c.suppress(a.email,a.reason);break;case'record_reply':result=await c.reply(a.id);break;case'finish_research_run':result=await c.finishRun(a.run_id,a.report);break;default:throw Error('Unknown tool');}
 return Response.json({jsonrpc:'2.0',id:rpc.id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false}},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return Response.json({jsonrpc:'2.0',id:rpc?.id??null,result:{content:[{type:'text',text:error instanceof Error?error.message:'Action failed'}],isError:true}},{headers:{'Cache-Control':'private, no-store'}});}}
