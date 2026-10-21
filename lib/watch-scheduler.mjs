// Cloud scheduler adapter: only explicitly opted-in tenant boards, bounded public read-only ATS scans.
// Never forwards resumes, contacts or credentials; does not send email or submit job applications.
import {BoardWatch} from './board-watch.mjs';
import {discoverATSJobs} from './ats-discovery.mjs';
import {reconcileDeletingAccounts} from './tenant-purge.mjs';
import {runOrphanMaintenance} from './tenant-maintenance.mjs';
import {AccessError,assertMultiuserAllowed} from './release-security.mjs';

function timingSafe(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length||a.length>256)return false;
 let difference=0;
 for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
 return difference===0;
}
export function authorizeWatchScheduler(request,env){
 assertMultiuserAllowed(env);
 if(request.method!=='POST')throw new AccessError('Scheduler requires POST',405);
 const expected=env.OPENCAREER_WATCH_CRON_SECRET;
 if(typeof expected!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(expected))throw new AccessError('Scheduler is not configured',503);
 const authorization=request.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer ')||!timingSafe(authorization.slice(7),expected))throw new AccessError('Unauthorized scheduler',401);
 // Disable browser-based cross-origin usage even if a secret were inadvertently copied to a frontend.
 if(request.headers.has('origin'))throw new AccessError('Scheduler requests cannot originate in browsers',403);
 return true;
}
export async function runScheduledWatches(env,{discover=discoverATSJobs,now=()=>Date.now()}={}){
 assertMultiuserAllowed(env);
 if(!env.DB?.prepare)throw new AccessError('Job watch database unavailable',503);
 const date=new Date(now()),olderThan=new Date(date.getTime()-3600000).toISOString();
 // Never run more than three provider requests per invocation.
 const boards=(await env.DB.prepare(`SELECT b.id,b.tenant_id FROM tenant_boards b
  JOIN tenant_accounts a ON a.id=b.tenant_id
  WHERE a.status='active' AND b.auto_scan=1
  AND (b.last_attempt_at IS NULL OR b.last_attempt_at<?)
  ORDER BY COALESCE(b.last_attempt_at,b.created_at),b.id LIMIT 3`).bind(olderThan).all()).results;
 const summary={selected:boards.length,completed:0,failed:0,newly_detected:0,baseline_scans:0};
 for(const b of boards){
  try{
   const watch=new BoardWatch(env.DB,b.tenant_id,{discover,clock:()=>date.toISOString()});
   const result=await watch.scan(b.id,{requireOptIn:true});
   summary.completed++;summary.newly_detected+=result.newly_detected;
   if(result.baseline)summary.baseline_scans++;
  }catch{
   // BoardWatch stores a sanitized failure on the board; avoid leaking tenant context or PII in the scheduler response.
   summary.failed++;
  }
 }
 // Never retain expired login state, revoked session rows or throttle metadata indefinitely.
 const throttle=await env.DB.prepare('DELETE FROM request_limits WHERE expires_at<?').bind(date.getTime()-86400000).run();
 const sessions=await env.DB.prepare('DELETE FROM browser_sessions WHERE expires_at<?').bind(date.toISOString()).run();
 const transactions=await env.DB.prepare('DELETE FROM login_transactions WHERE expires_at<?').bind(date.toISOString()).run();
 // A user stuck in 'deleting' cannot log back in to retry their request.
 const account_cleanup=await reconcileDeletingAccounts(env,{limit:3});
 // GC is explicitly gated: never run active-account object listing on an unconfigured site.
 let orphan_cleanup={enabled:false};
 if(env.OPENCAREER_ORPHAN_GC_ENABLED==='true'){
  try{orphan_cleanup={enabled:true,...await runOrphanMaintenance(env,{now})};}
  catch{orphan_cleanup={enabled:true,failed:1};}
 }
 return {...summary,account_cleanup,orphan_cleanup,retention_cleanup:{
  throttles:throttle.meta?.changes||0,sessions:sessions.meta?.changes||0,login_transactions:transactions.meta?.changes||0
 }};
}
