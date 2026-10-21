// Server-only OIDC Authorization Code + PKCE and opaque HttpOnly browser sessions.
// Do not place tokens, session secrets, or code verifiers in browser JavaScript.
import {authenticate,IdentityError} from './tenant-identity.mjs';
import {TenantWorkspace} from './tenant-workspace.mjs';

const encode = v => btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random = (bytes=32) => encode(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async str => encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)));
const COOKIE_STATE='__Host-oc_tx',COOKIE_SESSION='__Host-oc_session';
const NOW=()=>Date.now();
const maxSession=12*60*60;
const hexsecret = v => {
 if(typeof v!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(v))throw new IdentityError('Browser session secret is missing or invalid',503);
 return Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')+'='),x=>x.charCodeAt(0));
};
const checkURL = (value,label)=>{
 let u;try{u=new URL(value);}catch{throw new IdentityError(label+' is not configured',503);}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||!u.hostname.includes('.')||u.hostname==='localhost'||u.hostname.endsWith('.local'))throw new IdentityError('Invalid '+label,503);
 return u;
};
function config(env) {
 const origin=checkURL(env.OPENCAREER_SITE_ORIGIN,'site origin');
 if(origin.href!==origin.origin+'/' || origin.search)throw new IdentityError('Site origin must be an exact HTTPS origin',503);
 const auth=checkURL(env.OPENCAREER_OIDC_AUTH_URL,'authorization endpoint');
 const token=checkURL(env.OPENCAREER_OIDC_TOKEN_URL,'token endpoint');
 const client=env.OPENCAREER_OIDC_CLIENT_ID,secret=env.OPENCAREER_OIDC_CLIENT_SECRET;
 if(typeof client!=='string'||!/^[^\s]{3,300}$/.test(client)||typeof secret!=='string'||secret.length<12||secret.length>1024)throw new IdentityError('OIDC confidential client is not configured',503);
 hexsecret(env.OPENCAREER_SESSION_SECRET);
 hexsecret(env.OPENCAREER_TENANT_SECRET);
 hexsecret(env.OPENCAREER_CV_ENCRYPTION_KEY);
 checkURL(env.OPENCAREER_OIDC_ISSUER,'OIDC issuer');
 checkURL(env.OPENCAREER_OIDC_JWKS_URL,'identity verification keys');
 if(env.OPENCAREER_SESSION_SECRET===env.OPENCAREER_TENANT_SECRET||env.OPENCAREER_SESSION_SECRET===env.OPENCAREER_CV_ENCRYPTION_KEY||env.OPENCAREER_TENANT_SECRET===env.OPENCAREER_CV_ENCRYPTION_KEY)throw new IdentityError('Independent session, tenant and document secrets are required',503);
 return {origin:origin.origin,auth,token,client,secret};
}
const cookie=(name,value,maxAge)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
function requestOrigin(request,configured) {
 const current=new URL(request.url);
 if(current.origin!==configured)throw new IdentityError('Unexpected request origin',403);
}
function readCookie(request,name) {
 const header=request.headers.get('cookie')||'';
 for(const entry of header.split(';')){
  const index=entry.indexOf('=');if(index<0)continue;
  if(entry.slice(0,index).trim()===name)return entry.slice(index+1).trim();
 }
 return null;
}
const eql=(a,b)=> {
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let delta=0;for(let i=0;i<a.length;i++)delta|=a.charCodeAt(i)^b.charCodeAt(i);
 return delta===0;
};
function csrfGuard(request,expectedOrigin,expectedToken){
 const origin=request.headers.get('origin');
 if(origin!==expectedOrigin||request.headers.get('sec-fetch-site')==='cross-site')throw new IdentityError('Cross-origin mutation refused',403);
 if(!eql(request.headers.get('x-oc-csrf'),expectedToken))throw new IdentityError('CSRF token required',403);
}
async function csrfValue(raw,env){
 const key=await crypto.subtle.importKey('raw',hexsecret(env.OPENCAREER_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return encode(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('csrf\x00'+raw)));
}
async function getSession(request,env,{now=NOW}={}){
 const cfg=config(env);requestOrigin(request,cfg.origin);
 const raw=readCookie(request,COOKIE_SESSION);
 if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw))throw new IdentityError('Sign in required');
 const token_hash=await sha256(raw);
 const row=await env.DB.prepare("SELECT s.tenant_id,s.expires_at,a.email,a.display_name,a.status FROM browser_sessions s JOIN tenant_accounts a ON a.id=s.tenant_id WHERE s.token_hash=?").bind(token_hash).first();
 if(!row||row.status!=='active'||Date.parse(row.expires_at)<=now())throw new IdentityError('Session expired or revoked');
 return {raw,token_hash,identity:Object.freeze({tenantId:row.tenant_id,email:row.email,displayName:row.display_name})};
}
export async function sessionIdentity(request,env,options={}){
 const session=await getSession(request,env,options);
 if(!['GET','HEAD','OPTIONS'].includes(request.method))csrfGuard(request,config(env).origin,await csrfValue(session.raw,env));
 return session.identity;
}
export async function identityForAPI(request,env,options={}){
 // An explicit Authorization header uses the original MCP-friendly bearer-token path.
 // Cookies cannot override a supplied invalid Authorization header.
 if(request.headers.has('authorization'))return authenticate(request,env,options);
 return sessionIdentity(request,env,options);
}
export async function startLogin(request,env,{now=NOW}={}){
 const cfg=config(env);requestOrigin(request,cfg.origin);
 const state=random(),verifier=random(),nonce=random();
 const challenge=await sha256(verifier),at=now(),expires=new Date(at+600000).toISOString();
 await env.DB.prepare('DELETE FROM login_transactions WHERE expires_at<?').bind(new Date(at).toISOString()).run();
 await env.DB.prepare("INSERT INTO login_transactions(state_hash,code_verifier,nonce,expires_at) VALUES(?,?,?,?)").bind(await sha256(state),verifier,nonce,expires).run();
 const url=new URL(cfg.auth);
 for(const [key,value] of Object.entries({client_id:cfg.client,redirect_uri:cfg.origin+'/auth/callback',response_type:'code',scope:'openid email profile',state,nonce,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(key,value);
 return new Response(null,{status:303,headers:{Location:url.href,'Set-Cookie':cookie(COOKIE_STATE,state,600),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
async function exchange(code,verifier,cfg,fetcher){
 const credentials=btoa(String.fromCharCode(...new TextEncoder().encode(cfg.client+':'+cfg.secret)));
 const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:cfg.origin+'/auth/callback',code_verifier:verifier});
 const response=await fetcher(cfg.token.href,{method:'POST',redirect:'error',headers:{Authorization:'Basic '+credentials,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:body.toString(),signal:AbortSignal.timeout(12000)});
 if(response.status!==200)throw new IdentityError('Identity provider rejected the authorization code',401);
 if(Number(response.headers.get('content-length')||0)>32000)throw new IdentityError('Identity response too large',502);
 const reader=response.body?.getReader();if(!reader)throw new IdentityError('Identity response missing',502);
 let count=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>32000)throw new IdentityError('Identity response too large',502);chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(count);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new IdentityError('Malformed identity response',502);}
 if(typeof data.id_token!=='string'||data.id_token.length>8192)throw new IdentityError('Missing verified identity token',401);
 return data.id_token;
}
export async function finishLogin(request,env,{fetcher=fetch,now=NOW}={}){
 const cfg=config(env);requestOrigin(request,cfg.origin);
 const params=new URL(request.url).searchParams;
 const state=params.get('state'),cookieState=readCookie(request,COOKIE_STATE),code=params.get('code');
 if(params.has('iss')&&params.get('iss')!==env.OPENCAREER_OIDC_ISSUER)throw new IdentityError('Authorization server issuer mismatch');
 if(!state||!cookieState||!eql(state,cookieState)||!/^[A-Za-z0-9_-]{43}$/.test(state)||!code||code.length>4096)throw new IdentityError('Sign-in transaction mismatch');
 const stateHash=await sha256(state);
 const row=await env.DB.prepare('SELECT code_verifier,nonce,expires_at FROM login_transactions WHERE state_hash=?').bind(stateHash).first();
 if(!row||Date.parse(row.expires_at)<=now())throw new IdentityError('Sign-in transaction expired');
 // Consume the state once, BEFORE an external network request. A failed flow requires a fresh login.
 const consumed=await env.DB.prepare('DELETE FROM login_transactions WHERE state_hash=? AND expires_at>?').bind(stateHash,new Date(now()).toISOString()).run();
 if(consumed.meta.changes!==1)throw new IdentityError('Sign-in transaction already consumed');
 const idToken=await exchange(code,row.code_verifier,cfg,fetcher);
 const identity=await authenticate(new Request(cfg.origin+'/auth/callback',{headers:{authorization:'Bearer '+idToken}}),{
  ...env,OPENCAREER_OIDC_AUDIENCE:cfg.client
 },{fetcher,now,expectedNonce:row.nonce});
 const workspace=new TenantWorkspace(env,identity);
 await workspace.onboard();
 const raw=random(),tokenHash=await sha256(raw),expiry=new Date(now()+maxSession*1000).toISOString();
 await env.DB.prepare('INSERT INTO browser_sessions(token_hash,tenant_id,created_at,expires_at) VALUES(?,?,?,?)').bind(tokenHash,identity.tenantId,new Date(now()).toISOString(),expiry).run();
 const headers=new Headers({Location:cfg.origin+'/join','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 headers.append('Set-Cookie',cookie(COOKIE_STATE,'',0));
 headers.append('Set-Cookie',cookie(COOKIE_SESSION,raw,maxSession));
 return new Response(null,{status:303,headers});
}
export async function describeSession(request,env,options={}){
 const session=await getSession(request,env,options);
 return {signed_in:true,tenant_id:session.identity.tenantId,name:session.identity.displayName,email:session.identity.email,csrf:await csrfValue(session.raw,env)};
}
export async function logout(request,env,options={}){
 const cfg=config(env);const session=await getSession(request,env,options);
 csrfGuard(request,cfg.origin,await csrfValue(session.raw,env));
 await env.DB.prepare('DELETE FROM browser_sessions WHERE token_hash=?').bind(session.token_hash).run();
 return new Response(JSON.stringify({signed_out:true}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie(COOKIE_SESSION,'',0)}});
}
export async function loginAvailability(env){
 try{config(env);return true;}catch{return false;}
}
