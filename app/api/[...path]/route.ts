import { env } from 'cloudflare:workers';
import { Career } from '@/lib/career.mjs';
export const dynamic='force-dynamic';

function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
async function bounded(request:Request,limit=200000){const reader=request.body?.getReader();if(!reader)throw Error('Request body missing');const parts:Uint8Array[]=[];let total=0;while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw Error('Request body too large');}parts.push(value);}const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;}
async function json(request:Request){return JSON.parse(new TextDecoder().decode(await bounded(request)));}
async function handler(request:Request){try{const url=new URL(request.url),path=url.pathname.slice(5),method=request.method;const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return response({error:'Cross-origin access refused'},403);const career=new Career(env);
 if(method==='GET'){
  if(path==='companies')return response(await career.contacts().companies(Object.fromEntries(url.searchParams)));
  if(path==='contacts')return response(await career.contacts().search(Object.fromEntries(url.searchParams)));
  if(path==='contacts/stats')return response(await career.contacts().stats());
  if(path==='contacts/detail')return response(await career.contacts().detail(url.searchParams.get('email')));
  if(path==='status')return response(await career.status());
  if(path==='profile')return response(await career.profile()||{name:'',evidence:[]});
  if(path==='outreach')return response({items:await career.list()});
  if(path==='leads')return response({items:(await env.DB!.prepare('SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500').all()).results});
  if(path==='activity')return response({items:(await env.DB!.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 100').all()).results});
  if(path==='agent-context')return response(await career.context(false));
  if(path==='cv-payload')return response(await career.context(true));
  if(path==='instructions')return response({workflow:(await career.context()).instructions});
  if(path==='export')return new Response(JSON.stringify({outreach:await career.list(),runs:await career.history()},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="open-career-export.json"','Cache-Control':'private, no-store'}});
 }
 if(method==='POST'){
  if(path==='cv')return response(await career.uploadCV(await bounded(request,5000000)));
  const data=await json(request);
  if(path==='companies/import')return response(await career.contacts().importCompanies(data));
  if(path==='contacts/import')return response(await career.contacts().import(data));
  if(path==='contacts/collect')return response(await career.contacts().collect(data));
  if(path==='profile')return response(await career.setProfile(data));
  if(path==='settings')return response(await career.setSettings(data));
  if(path==='source-inspection')return response(await career.inspectSource(data.url));
  if(path==='research-plan')return response(career.researchPlan(data.domain));
  if(path==='queue')return response(await career.queue(data.packet||data,data.run_id||null));
  if(path==='leads')return response(await career.recordLead(data));
  if(path==='reserve')return response(await career.reserve(data.id));
  if(path==='receipt')return response(await career.receipt(data));
  if(path==='uncertain')return response(await career.uncertain(data.reservation_token,data.reason));
  if(path==='suppress')return response(await career.suppress(data.email,data.reason));
  if(path.startsWith('cancel/'))return response(await career.cancel(path.slice(7)));
  if(path==='feedback')return response(await career.feedback(data));
  if(path==='heartbeat')return response(await career.heartbeat(data.run_id));
  if(path==='reply')return response(await career.reply(data.id));
  if(path==='start-run')return response(await career.startRun(data.kind));
  if(path==='finish-run')return response(await career.finishRun(data.run_id,data.report));
  if(path==='verification'){await career.saveConfig('verification',data);return response({saved:true});}
  if(path==='schedule-registration'){await career.saveConfig('schedule',data);return response({saved:true});}
  if(path==='run'||path.startsWith('send/')||path==='sync')return response({error:'Use Open Career in ChatGPT to research, deliver or check Gmail replies. This private tracker does not contain Gmail credentials.'},409);
 }
 return response({error:'Unknown endpoint'},404);
}catch(error){return response({error:error instanceof Error?error.message:'Action failed'},400);}}
export const GET=handler;export const POST=handler;
