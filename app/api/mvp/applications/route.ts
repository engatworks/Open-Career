import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { MVPWorkflow } from '@/lib/mvp-workflow.mjs';
export const dynamic='force-dynamic';
const respond=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(){
 try{
  const u=await getChatGPTUser();
  if(!u?.userId)return respond({error:'Sign in required'},401);
  return respond({items:await new MVPWorkflow(env.DB,u.userId).applications()});
 }catch(e){return respond({error:e instanceof Error?e.message:'Failed'},400);}
}
export async function POST(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)return respond({error:'Same-origin user action required'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return respond({error:'JSON required'},415);
  const u=await getChatGPTUser();
  if(!u?.userId)return respond({error:'Sign in required'},401);
  const raw=await request.text();
  if(raw.length>4000)return respond({error:'Request too long'},413);
  const d=JSON.parse(raw);
  if(d.action!=='confirm')return respond({error:'Only direct user confirmation is supported here'},400);
  return respond(await new MVPWorkflow(env.DB,u.userId).confirm({id:d.id,confirmationRef:d.confirmationRef}));
 }catch(e){return respond({error:e instanceof Error?e.message:'Failed'},400);}
}
