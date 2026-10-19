import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { MVPWorkflow } from '@/lib/mvp-workflow.mjs';
import { SCOPES } from '@/lib/mvp-consent.mjs';
export const dynamic='force-dynamic';

function respond(value:unknown,status=200) {
 return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function GET() {
 try {
  const user=await getChatGPTUser();
  if(!user?.userId)return respond({error:'Sign in required'},401);
  return respond({...await new MVPWorkflow(env.DB,user.userId).status(),availableScopes:SCOPES});
 }catch(e){return respond({error:e instanceof Error?e.message:'Unavailable'},400);}
}
export async function POST(request:Request) {
 try {
  const url=new URL(request.url);
  if(request.headers.get('origin')!==url.origin)return respond({error:'Same-origin user consent required'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return respond({error:'JSON required'},415);
  const user=await getChatGPTUser();
  if(!user?.userId)return respond({error:'Sign in required'},401);
  const raw=await request.text();
  if(raw.length>6000)return respond({error:'Request too large'},413);
  const data=JSON.parse(raw),workflow=new MVPWorkflow(env.DB,user.userId);
  if(data?.action==='accept')return respond({...await workflow.accept({agree:data.agree,selectedScopes:data.selectedScopes}),availableScopes:SCOPES});
  if(data?.action==='revoke')return respond({...await workflow.revoke(data.scope),availableScopes:SCOPES});
  return respond({error:'Unsupported consent action'},400);
 }catch(e){return respond({error:e instanceof Error?e.message:'Unavailable'},400);}
}
