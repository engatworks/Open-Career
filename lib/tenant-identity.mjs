// Open Career OIDC verification. Tokens must be issued and signed by the configured identity provider.
// Never trust a client-supplied tenant ID, identity header, email address, or unsigned JWT payload.
const enc=new TextEncoder();
const CACHE=new Map();
const MAX_TOKEN=8192,MAX_JWKS=100000,LEEWAY=60;
export class IdentityError extends Error{constructor(message,status=401){super(message);this.name='IdentityError';this.status=status;}}
function configuration(env){
 const issuer=env.OPENCAREER_OIDC_ISSUER,audience=env.OPENCAREER_OIDC_AUDIENCE,jwks=env.OPENCAREER_OIDC_JWKS_URL,secret=env.OPENCAREER_TENANT_SECRET;
 if(!issuer||!audience||!jwks||!secret)throw new IdentityError('OIDC identity service is not configured',503);
 for(const value of [issuer,jwks]){
  let u;try{u=new URL(value);}catch{throw new IdentityError('Invalid OIDC service configuration',503);}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!u.hostname.includes('.'))throw new IdentityError('Invalid OIDC service configuration',503);
 }
 if(issuer.endsWith('/')||audience.length>200)throw new IdentityError('Invalid OIDC service configuration',503);
 const key=decode(secret);
 if(key.length!==32)throw new IdentityError('Tenant derivation secret must be 32 bytes',503);
 return {issuer,audience,jwks,key};
}
function decode(value){
 if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value))throw new IdentityError('Malformed base64url data',401);
 try{return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),x=>x.charCodeAt(0));}catch{throw new IdentityError('Malformed base64url data',401);}
}
const encode=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function jsonPart(value){const bytes=decode(value);if(bytes.length>10000)throw new IdentityError('Oversized token claims');try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new IdentityError('Malformed JWT payload');}}
async function keys(config,fetcher,now){
 const key=config.jwks;const cached=CACHE.get(key);
 if(cached&&now-cached.at<300000)return cached.keys;
 const response=await fetcher(key,{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(response.status!==200)throw new IdentityError('Identity keys unavailable',503);
 if(Number(response.headers.get('content-length')||0)>MAX_JWKS)throw new IdentityError('Identity key response too large',503);
 const reader=response.body?.getReader();if(!reader)throw new IdentityError('Identity key response missing',503);
 let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_JWKS)throw new IdentityError('Identity key response too large',503);chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}
 let parsed;try{parsed=JSON.parse(new TextDecoder().decode(body));}catch{throw new IdentityError('Invalid identity key response',503);}
 if(!Array.isArray(parsed.keys)||parsed.keys.length>30)throw new IdentityError('Invalid identity key response',503);
 CACHE.set(key,{at:now,keys:parsed.keys});if(CACHE.size>4)CACHE.delete(CACHE.keys().next().value);
 return parsed.keys;
}
async function tenantId(issuer,sub,key){
 const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',k,enc.encode(issuer+'\x00'+sub));
 return 'usr_'+encode(signature).slice(0,43);
}
export async function authenticate(request,env,{fetcher=fetch,now=()=>Date.now(),expectedNonce=null}={}){
 const config=configuration(env);
 const header=request.headers.get('authorization')||'';
 if(header.length>MAX_TOKEN||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header))throw new IdentityError('Signed bearer token required');
 const token=header.slice(7),parts=token.split('.'),jwtHeader=jsonPart(parts[0]),claims=jsonPart(parts[1]);
 if(jwtHeader?.alg!=='RS256'||typeof jwtHeader.kid!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(jwtHeader.kid))throw new IdentityError('Unsupported JWT signature');
 if(jwtHeader.jku||jwtHeader.jwk||jwtHeader.x5u)throw new IdentityError('Token-supplied keys are forbidden');
 if(claims?.iss!==config.issuer||!((typeof claims.aud==='string'&&claims.aud===config.audience)||(Array.isArray(claims.aud)&&claims.aud.includes(config.audience)&&claims.azp===config.audience)))throw new IdentityError('Token issuer or audience mismatch');
 const seconds=Math.floor(now()/1000);
 if(!Number.isSafeInteger(claims.exp)||claims.exp<=seconds-LEEWAY||!Number.isSafeInteger(claims.iat)||claims.iat>seconds+LEEWAY||claims.exp-claims.iat>86400||claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>seconds+LEEWAY))throw new IdentityError('Token expired, premature or invalid');
 if(typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255)throw new IdentityError('Invalid token subject');
 let jwk=(await keys(config,fetcher,now())).find(k=>k.kid===jwtHeader.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig')&&(!k.key_ops||k.key_ops.includes('verify')));
 if(!jwk)throw new IdentityError('Signing key not recognized');
 let key;try{key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);}catch{throw new IdentityError('Invalid signing key',503);}
 const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),enc.encode(parts[0]+'.'+parts[1]));
 if(!valid)throw new IdentityError('Invalid token signature');
 if(expectedNonce!==null&&(typeof expectedNonce!=='string'||claims.nonce!==expectedNonce))throw new IdentityError('OIDC nonce mismatch');
 return Object.freeze({tenantId:await tenantId(config.issuer,claims.sub,config.key),issuer:config.issuer,subject:claims.sub,
  email:claims.email_verified===true&&typeof claims.email==='string'?claims.email.slice(0,200):null,
  displayName:typeof claims.name==='string'?claims.name.slice(0,120):null});
}
// Only tests may clear the process-local JWK cache; no token/session is stored here.
export function clearKeyCacheForTests(){CACHE.clear();}
