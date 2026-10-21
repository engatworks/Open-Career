import {env} from 'cloudflare:workers';
import {authorizeWatchScheduler} from '@/lib/watch-scheduler.mjs';
import {inspectReleaseReadiness} from '@/lib/release-readiness.mjs';
import {AccessError} from '@/lib/release-security.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  authorizeWatchScheduler(request,env);
  return Response.json(await inspectReleaseReadiness(env),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){
  const status=error instanceof AccessError?error.status:503;
  return Response.json({error:'Operator readiness check unavailable'},{status,headers:{'Cache-Control':'no-store'}});
 }
}
