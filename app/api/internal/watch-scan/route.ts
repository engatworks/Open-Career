import {env} from 'cloudflare:workers';
import {authorizeWatchScheduler,runScheduledWatches} from '@/lib/watch-scheduler.mjs';
import {AccessError} from '@/lib/release-security.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  authorizeWatchScheduler(request,env);
  return Response.json(await runScheduledWatches(env),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){
  const status=e instanceof AccessError?e.status:503;
  return Response.json({error:status===503?'Scheduler unavailable':'Scheduler request denied'},{status,headers:{'Cache-Control':'no-store'}});
 }
}
