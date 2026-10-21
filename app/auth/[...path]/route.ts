import {publicFailure} from '@/lib/public-errors.mjs';
import {env} from 'cloudflare:workers';
import {startLogin,finishLogin,describeSession,logout,loginAvailability} from '@/lib/browser-auth.mjs';
import {IdentityError} from '@/lib/tenant-identity.mjs';
import {AccessError} from '@/lib/release-security.mjs';
export const dynamic='force-dynamic';
const base={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:base});
async function handler(request:Request) {
 const url=new URL(request.url),path=url.pathname.replace(/^\/auth\/?/,'');
 try {
  if(request.method==='GET'&&path==='status')return json({configured:await loginAvailability(env)});
  if(request.method==='GET'&&path==='start')return startLogin(request,env);
  if(request.method==='GET'&&path==='callback')return finishLogin(request,env);
  if(request.method==='GET'&&path==='session')return json(await describeSession(request,env));
  if(request.method==='POST'&&path==='logout')return logout(request,env);
  return json({error:'Unknown authentication endpoint'},404);
 }catch(error) {
  const failure=publicFailure(error);
  return json({error:failure.message},failure.status);
 }
}
export const GET=handler;export const POST=handler;
