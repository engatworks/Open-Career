import {env} from 'cloudflare:workers';
import {authenticate,IdentityError} from '@/lib/tenant-identity.mjs';
import {TenantWorkspace} from '@/lib/tenant-workspace.mjs';
import {discoverATSJobs} from '@/lib/ats-discovery.mjs';
import {AccessError,assertMultiuserAllowed,assertOnboardingAllowed,throttleTenant} from '@/lib/release-security.mjs';
export const dynamic='force-dynamic';
const str={type:'string'};
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const tools=[
 {name:'workspace_account',description:'Read current authenticated identity registration and tenant workspace status.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'onboard_workspace',description:'Provision a workspace exclusively for the verified OIDC bearer identity.',inputSchema:object({})},
 {name:'get_candidate_profile',description:'Read your own approved candidate profile. No cross-user profile access.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'save_candidate_profile',description:'Save your own profile and approved factual evidence. Never invent credentials, experience or work authorization.',inputSchema:object({profile:{type:'object'}},['profile'])},
 {name:'cv_attachment_status',description:'Read your own encrypted CV fingerprint and size, but not the private file.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'my_contacts',description:'List only the authenticated user contact candidates. These are not eligible for automatic sending.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'add_contact_candidate',description:'Save one explicitly sourced, unverified professional contact within your own workspace.',inputSchema:object({email:str,name:str,company:str,role:str,source_url:str},['email'])},
 {name:'my_ats_applications',description:'List only the authenticated user ATS application records.',inputSchema:object({}),annotations:{readOnlyHint:true}},
 {name:'discover_public_ats_jobs_v2',description:'Read only public job listings from Greenhouse, Lever or Ashby. This never applies for a job.',inputSchema:object({provider:{type:'string',enum:['greenhouse','lever','ashby']},board:str,region:{type:'string',enum:['global','eu']},query:str,limit:{type:'integer'}},['provider','board']),annotations:{readOnlyHint:true}},
 {name:'track_ats_job',description:'Save an ATS vacancy in your own workspace without applying.',inputSchema:object({job:{type:'object'}},['job'])},
 {name:'prepare_my_application',description:'Freeze an application with your uploaded CV and form/answer fingerprints. Does not submit.',inputSchema:object({id:str,cv_sha256:str,answers_sha256:str,form_sha256:str},['id','cv_sha256','answers_sha256','form_sha256'])},
 {name:'approve_my_application',description:'Explicitly approve the unchanged application packet. This does NOT submit a job application.',inputSchema:object({id:str,cv_sha256:str,answers_sha256:str,form_sha256:str,consent:{type:'boolean'}},['id','cv_sha256','answers_sha256','form_sha256','consent'])},
];
const out=(id:unknown,result:unknown)=>Response.json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false}},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(request:Request){
 let id:unknown=null;
 try{
  assertMultiuserAllowed(env);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Cross-origin access refused'},{status:403});
  const identity=await authenticate(request,env);
  if(Number(request.headers.get('content-length')||0)>50000)throw Error('MCP request exceeds allowed size');
  const reader=request.body?.getReader();if(!reader)throw Error('MCP request body missing');let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>50000)throw Error('MCP request exceeds allowed size');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const rpc:any=JSON.parse(new TextDecoder().decode(bytes));
  id=rpc?.id??null;
  if(rpc?.jsonrpc!=='2.0'||typeof rpc.method!=='string')throw Error('Invalid JSON-RPC');
  if(rpc.method==='initialize')return Response.json({jsonrpc:'2.0',id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'Open Career multi-user',version:'0.6.0-alpha'}}});
  if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
  if(rpc.method==='tools/list')return Response.json({jsonrpc:'2.0',id,result:{tools}});
  if(rpc.method!=='tools/call')throw Error('Unknown MCP method');
  const workspace=new TenantWorkspace(env,identity),a=rpc.params?.arguments??{};let result:unknown;
  if(!['workspace_account','get_candidate_profile','cv_attachment_status','my_contacts','my_ats_applications','discover_public_ats_jobs_v2','onboard_workspace'].includes(rpc.params?.name)){
   await workspace.account();await throttleTenant(env,identity,'workspace_write',80,{intervalSeconds:3600});
  }
  switch(rpc.params?.name){
   case 'workspace_account':result=await workspace.me();break;
   case 'onboard_workspace':
    await throttleTenant(env,identity,'onboard',6,{intervalSeconds:3600});
    await assertOnboardingAllowed(env,identity);
    result=await workspace.onboard();break;
   case 'get_candidate_profile':result=await workspace.profile();break;
   case 'save_candidate_profile':result=await workspace.setProfile(a.profile);break;
   case 'cv_attachment_status':result=await workspace.cvInfo();break;
   case 'my_contacts':result={items:await workspace.contacts()};break;
   case 'add_contact_candidate':result=await workspace.addContact(a);break;
   case 'my_ats_applications':result={items:await(await workspace.applications()).list()};break;
   case 'discover_public_ats_jobs_v2':
    await workspace.account();
    await throttleTenant(env,identity,'ats_jobs',30,{intervalSeconds:600});
    result=await discoverATSJobs(a);break;
   case 'track_ats_job':result=await(await workspace.applications()).track(a.job);break;
   case 'prepare_my_application':{
    const cv=await workspace.cvInfo();if(!cv||cv.sha256!==a.cv_sha256)throw Error('CV fingerprint mismatch');
    result=await(await workspace.applications()).prepare(a.id,a);break;
   }
   case 'approve_my_application':{
    const cv=await workspace.cvInfo();if(!cv||cv.sha256!==a.cv_sha256)throw Error('CV fingerprint mismatch');
    result=await(await workspace.applications()).approve(a.id,a);break;
   }
   default:throw Error('Unknown MCP tool');
  }
  return out(id,result);
 }catch(error){
  const status=error instanceof AccessError?error.status:error instanceof IdentityError?error.status:400;
  return Response.json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:error instanceof Error?error.message:'Action failed'}],isError:true}},{status,headers:{'Cache-Control':'private, no-store'}});
 }
}
