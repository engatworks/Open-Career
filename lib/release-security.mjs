// Deployment boundaries are intentionally explicit. An absent/mistyped mode means CLOSED, not public.
// All public-account identities originate from verified OIDC tokens or signed server sessions.
export class AccessError extends Error {
 constructor(message='Access denied',status=403){super(message);this.name='AccessError';this.status=status;}
}
export const ACCESS_MODES=Object.freeze(['owner_private','multiuser_beta','multiuser_public']);
export function accessMode(env){
 const mode=env?.OPENCAREER_ACCESS_MODE;
 return ACCESS_MODES.includes(mode)?mode:'disabled';
}
export function legacyAllowed(env){return accessMode(env)==='owner_private';}
export function multiuserAllowed(env){return ['multiuser_beta','multiuser_public'].includes(accessMode(env));}
export function assertLegacyAllowed(env){if(!legacyAllowed(env))throw new AccessError('Owner-private API is unavailable on this deployment',404);}
export function assertMultiuserAllowed(env){if(!multiuserAllowed(env))throw new AccessError('Multi-user registration is not enabled',503);}
const safeEmail=x=>typeof x==='string'&&x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)?x.toLowerCase():null;
export function parseBetaAllowlist(value) {
 if(typeof value!=='string'||!value.trim())return new Set();
 const values=value.split(',').map(x=>x.trim());
 if(values.length>200||values.some(x=>!safeEmail(x)))throw new AccessError('Invalid beta allowlist configuration',503);
 return new Set(values.map(x=>x.toLowerCase()));
}
export async function assertOnboardingAllowed(env,identity) {
 assertMultiuserAllowed(env);
 if(!identity?.tenantId||!/^usr_[A-Za-z0-9_-]{43}$/.test(identity.tenantId))throw new AccessError('Verified identity required',401);
 // Returning users retain access when beta enrollment closes.
 const existing=await env.DB.prepare('SELECT status FROM tenant_accounts WHERE id=?').bind(identity.tenantId).first();
 if(existing?.status==='active')return;
 if(existing)throw new AccessError('Account is suspended or deletion is in progress',403);
 const email=safeEmail(identity.email);
 if(!email)throw new AccessError('A verified email address is required for registration',403);
 if(accessMode(env)==='multiuser_beta'&&!parseBetaAllowlist(env.OPENCAREER_BETA_EMAIL_ALLOWLIST).has(email)){
  throw new AccessError('Registration is currently limited to invited beta testers',403);
 }
}
const keyPattern=/^[a-z][a-z0-9_-]{0,31}$/;
const enc=new TextEncoder();
function toBase64Url(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export async function hashedThrottleKey(secret,value) {
 if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(secret))throw new AccessError('Throttle key is not configured',503);
 const raw=Uint8Array.from(atob(secret.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
 if(raw.length!==32)throw new AccessError('Throttle key is not configured',503);
 const key=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return toBase64Url(await crypto.subtle.sign('HMAC',key,enc.encode(value))).slice(0,43);
}
export async function consumeLimit(env,{scope,owner,max,intervalSeconds=600,now=Date.now()}){
 if(!env?.DB?.prepare||!keyPattern.test(scope)||typeof owner!=='string'||owner.length>150||owner.length<8||!Number.isSafeInteger(max)||max<1||max>1000||!Number.isSafeInteger(intervalSeconds)||intervalSeconds<60||intervalSeconds>86400)throw new AccessError('Invalid request limit configuration',503);
 const window=Math.floor(now/(intervalSeconds*1000));
 const bucket=scope+':'+owner+':'+window;
 // Atomic UPSERT: concurrent requests cannot both claim the same final quota unit.
 const result=await env.DB.prepare(`INSERT INTO request_limits(bucket,count,expires_at)
 VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<?`).bind(bucket,(window+1)*intervalSeconds*1000,max).run();
 if(result.meta.changes!==1)throw new AccessError('Request limit reached. Try again later.',429);
 return {remaining:null,window_expires_at:(window+1)*intervalSeconds*1000};
}
export async function throttleSignIn(request,env,options={}){
 assertMultiuserAllowed(env);
 // CF-Connecting-IP must be supplied by the trusted Cloudflare edge. In non-CF runtimes,
 // use a coarse shared limit rather than trusting unverified X-Forwarded-For values.
 const address=request.headers.get('cf-connecting-ip')||'unknown';
 const owner=await hashedThrottleKey(env.OPENCAREER_SESSION_SECRET,'login:'+address.slice(0,100));
 return consumeLimit(env,{scope:'login',owner,max:12,intervalSeconds:600,...options});
}
export async function throttleTenant(env,identity,scope,max,options={}){
 assertMultiuserAllowed(env);
 if(!identity?.tenantId||!/^usr_[A-Za-z0-9_-]{43}$/.test(identity.tenantId))throw new AccessError('Verified identity required',401);
 return consumeLimit(env,{scope,owner:identity.tenantId,max,...options});
}
