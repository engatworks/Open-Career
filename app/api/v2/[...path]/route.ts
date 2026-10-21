import {publicFailure} from '@/lib/public-errors.mjs';
import {env} from 'cloudflare:workers';
import {IdentityError} from '@/lib/tenant-identity.mjs';
import {identityForAPI} from '@/lib/browser-auth.mjs';
import {TenantWorkspace} from '@/lib/tenant-workspace.mjs';
import {discoverATSJobs} from '@/lib/ats-discovery.mjs';
import {BoardWatch} from '@/lib/board-watch.mjs';
import {AccessError,assertMultiuserAllowed,assertOnboardingAllowed,throttleTenant} from '@/lib/release-security.mjs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const respond=(value:unknown,status=200)=>Response.json(value,{status,headers});
async function bounded(request:Request,max=50000){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing request body');
 let bytes=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max)throw Error('Request body exceeds allowed size');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const merged=new Uint8Array(bytes);let at=0;for(const c of chunks){merged.set(c,at);at+=c.length;}return merged;
}
async function json(request:Request){
 if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))throw Error('JSON content type required');
 return JSON.parse(new TextDecoder().decode(await bounded(request)));
}
async function handle(request:Request){
 try{
  assertMultiuserAllowed(env);
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/v2\/?/,'');
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return respond({error:'Cross-origin requests are not permitted'},403);
  const identity=await identityForAPI(request,env);
  const workspace=new TenantWorkspace(env,identity);
  if(request.method==='POST'&&path==='onboard'){
   await throttleTenant(env,identity,'onboard',6,{intervalSeconds:3600});
   await assertOnboardingAllowed(env,identity);
   return respond({account:await workspace.onboard(),tenant_id:identity.tenantId},201);
  }
  // Public provider jobs are read only, but fetching them has cost: require own registered account and quota.
  if(request.method==='GET'&&path==='ats/jobs'){
   await workspace.account();
   await throttleTenant(env,identity,'ats_jobs',30,{intervalSeconds:600});
   return respond(await discoverATSJobs({provider:url.searchParams.get('provider'),board:url.searchParams.get('board'),region:url.searchParams.get('region')||'global',query:url.searchParams.get('q')||'',limit:Number(url.searchParams.get('limit')||50)}));
  }
  // A bounded tenant quota applies to all workspace mutations, whether called from UI or REST clients.
  if(request.method!=='GET'&&request.method!=='HEAD'){
   await throttleTenant(env,identity,'workspace_write',80,{intervalSeconds:3600});
  }
  if(request.method==='GET'&&path==='me'){
   let account=null;try{account=await workspace.me();}catch(error){if(!(error instanceof Error)||!/not provisioned|inactive/.test(error.message))throw error;}return respond({tenant_id:identity.tenantId,registered:!!account,account});
  }
  if(path.startsWith('boards')||path==='listings'){
   await workspace.account();
   const watch=new BoardWatch(env.DB,identity.tenantId);
   if(request.method==='GET'&&path==='boards')return respond({items:await watch.boards()});
   if(request.method==='GET'&&path==='listings')return respond({items:await watch.listings({status:url.searchParams.get('status')||null,limit:Number(url.searchParams.get('limit')||100)})});
   if(request.method==='POST'&&path==='boards'){
    await throttleTenant(env,identity,'watch_write',30,{intervalSeconds:3600});
    return respond(await watch.save(await json(request)),201);
   }
   if(request.method==='DELETE'&&path==='boards'){
    await throttleTenant(env,identity,'watch_write',30,{intervalSeconds:3600});
    const input=await json(request);return respond(await watch.remove(input.id));
   }
   if(request.method==='POST'&&path==='boards/scan'){
    await throttleTenant(env,identity,'ats_jobs',30,{intervalSeconds:600});
    const input=await json(request);return respond(await watch.scan(input.id));
   }
   if(request.method==='POST'&&path==='boards/auto'){
    const input=await json(request);return respond(await watch.setAutoScan(input.id,input.enabled));
   }
   if(request.method==='POST'&&path==='boards/seen'){
    const input=await json(request);return respond(await watch.markSeen(input.job_key));
   }
  }
  if(request.method==='GET'&&path==='profile')return respond({profile:await workspace.profile()});
  if(request.method==='POST'&&path==='profile')return respond({profile:await workspace.setProfile(await json(request))});
  if(request.method==='GET'&&path==='cv/info')return respond({cv:await workspace.cvInfo()});
  if(request.method==='POST'&&path==='cv')return respond({cv:await workspace.uploadCV(await bounded(request,5_000_000))},201);
  if(request.method==='GET'&&path==='cv'){
   const {bytes,sha256}=await workspace.readCV();
   return new Response(bytes,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="CV.pdf"','X-Content-SHA256':sha256}});
  }
  if(request.method==='DELETE'&&path==='cv')return respond(await workspace.deleteCV());
  if(request.method==='GET'&&path==='contacts')return respond({items:await workspace.contacts()});
  if(request.method==='POST'&&path==='contacts')return respond(await workspace.addContact(await json(request)),201);
  if(request.method==='POST'&&path==='contacts/suppress'){const input=await json(request);return respond(await workspace.suppress(input.email));}
  if(request.method==='GET'&&path==='applications')return respond({items:await(await workspace.applications()).list()});
  if(request.method==='POST'&&path==='applications/track'){const input=await json(request);return respond(await(await workspace.applications()).track(input.job),201);}
  if(request.method==='POST'&&path==='applications/prepare'){
   const input=await json(request),cv=await workspace.cvInfo();if(!cv||cv.sha256!==input.cv_sha256)throw Error('Approved tenant CV does not match the prepared application');
   return respond({application:await(await workspace.applications()).prepare(input.id,input)});
  }
  if(request.method==='POST'&&path==='applications/approve'){
   const input=await json(request),cv=await workspace.cvInfo();if(!cv||cv.sha256!==input.cv_sha256)throw Error('Tenant CV fingerprint changed');
   return respond({application:await(await workspace.applications()).approve(input.id,input)});
  }
  if(request.method==='POST'&&path==='applications/cancel'){const input=await json(request);return respond({application:await(await workspace.applications()).cancel(input.id)});}
  if(request.method==='GET'&&path==='export')return Response.json(await workspace.exportData(),{headers:{...headers,'Content-Disposition':'attachment; filename="open-career-export.json"'}});
  if(request.method==='DELETE'&&path==='account'){const data=await json(request);return respond(await workspace.deleteAccount(data.confirm));}
  return respond({error:'Unknown API endpoint'},404);
 }catch(error){
  const failure=publicFailure(error);
  return respond({error:failure.message},failure.status);
 }
}
export const GET=handle;export const POST=handle;export const DELETE=handle;
