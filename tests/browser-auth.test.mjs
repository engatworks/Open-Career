import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {startLogin,finishLogin,describeSession,sessionIdentity,identityForAPI,logout,loginAvailability} from '../lib/browser-auth.mjs';
import {IdentityError,clearKeyCacheForTests} from '../lib/tenant-identity.mjs';
const origin='https://career.example.com';
const b64=v=>Buffer.from(v).toString('base64url');
const nowSec=()=>Math.floor(Date.now()/1000);
const settings={OPENCAREER_SITE_ORIGIN:origin,OPENCAREER_OIDC_ISSUER:'https://id.example.com',OPENCAREER_OIDC_AUTH_URL:'https://id.example.com/authorize',OPENCAREER_OIDC_TOKEN_URL:'https://id.example.com/token',OPENCAREER_OIDC_JWKS_URL:'https://id.example.com/jwks',OPENCAREER_OIDC_CLIENT_ID:'open-career-client',OPENCAREER_OIDC_CLIENT_SECRET:'this-is-a-private-test-secret',OPENCAREER_OIDC_AUDIENCE:'open-career-api',OPENCAREER_TENANT_SECRET:b64(crypto.getRandomValues(new Uint8Array(32))),OPENCAREER_CV_ENCRYPTION_KEY:b64(crypto.getRandomValues(new Uint8Array(32))),OPENCAREER_SESSION_SECRET:b64(crypto.getRandomValues(new Uint8Array(32))),OPENCAREER_ACCESS_MODE:'multiuser_beta',OPENCAREER_BETA_EMAIL_ALLOWLIST:'candidate@example.com'};
let keypair,publicJwk;
before(async()=>{
 clearKeyCacheForTests();keypair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 publicJwk={...await crypto.subtle.exportKey('jwk',keypair.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
});
async function issueToken(sub,nonce,overrides={}){
 const h=b64(JSON.stringify({alg:'RS256',kid:'test-key',typ:'JWT'}));
 const p=b64(JSON.stringify({iss:settings.OPENCAREER_OIDC_ISSUER,aud:settings.OPENCAREER_OIDC_CLIENT_ID,sub,nonce,iat:nowSec(),exp:nowSec()+3600,email:'candidate@example.com',email_verified:true,name:'Job Seeker',...overrides}));
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keypair.privateKey,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+b64(new Uint8Array(sig));
}
function setup(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const name of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+name,'utf8').replaceAll('--> statement-breakpoint',''));
 const DB={prepare(query){let values=[];const api={bind(...args){values=args;return api;},async first(){return sqlite.prepare(query).get(...values)||null;},async all(){return {results:sqlite.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sqlite.prepare(query).run(...values).changes)}};}};return api;},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const BUCKET={async put(){},async get(){return null},async delete(){}};
 return {...settings,DB,BUCKET,sqlite};
}
async function begin(env){
 const response=await startLogin(new Request(origin+'/auth/start'),env);
 assert.equal(response.status,303);
 const url=new URL(response.headers.get('location')),state=url.searchParams.get('state'),cookie=response.headers.get('set-cookie');
 assert.equal(url.origin,'https://id.example.com');
 assert.equal(url.searchParams.get('response_type'),'code');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('redirect_uri'),origin+'/auth/callback');
 assert.equal(url.searchParams.get('scope'),'openid email profile');
 assert.ok(cookie.includes('Secure; HttpOnly; SameSite=Lax'));
 return {url,state,cookie:cookie.split(';')[0],nonce:url.searchParams.get('nonce')};
}
function providerFetch(tokenFactory){
 return async (url,options)=>{
  if(url===settings.OPENCAREER_OIDC_JWKS_URL)return new Response(JSON.stringify({keys:[publicJwk]}),{headers:{'content-type':'application/json'}});
  assert.equal(url,settings.OPENCAREER_OIDC_TOKEN_URL);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  assert.ok(options.headers.Authorization.startsWith('Basic '));
  const form=new URLSearchParams(options.body);assert.equal(form.get('grant_type'),'authorization_code');
  assert.equal(form.get('redirect_uri'),origin+'/auth/callback');
  assert.equal(form.get('code'),'auth-code');
  assert.equal(form.get('code_verifier').length,43);
  return new Response(JSON.stringify({id_token:await tokenFactory()}),{headers:{'content-type':'application/json'}});
 };
}
async function finish(env,tx,sub='candidate-1',nonce=tx.nonce){
 const callback=new Request(origin+'/auth/callback?'+new URLSearchParams({state:tx.state,code:'auth-code'}),{headers:{cookie:tx.cookie}});
 const response=await finishLogin(callback,env,{fetcher:providerFetch(()=>issueToken(sub,nonce))});
 const cookies=response.headers.getSetCookie();
 const sessionLine=cookies.find(c=>c.startsWith('__Host-oc_session='));
 assert.ok(sessionLine);return {response,cookie:sessionLine.split(';')[0],cookies};
}

test('Authentication is unavailable without complete secure configuration',async()=>{
 assert.equal(await loginAvailability({...settings,OPENCAREER_OIDC_CLIENT_SECRET:undefined}),false);
 await assert.rejects(startLogin(new Request(origin+'/auth/start'),{...settings,OPENCAREER_SESSION_SECRET:''}),/session secret|configuration/i);
});
test('PKCE S256, state and nonce are unique, and transaction data is server-only',async()=>{
 const env=setup(),one=await begin(env),two=await begin(env);
 assert.notEqual(one.state,two.state);assert.notEqual(one.nonce,two.nonce);
 const row=env.sqlite.prepare('SELECT * FROM login_transactions').get();
 assert.notEqual(row.state_hash,one.state);
 const verifier=one.state===undefined?'':env.sqlite.prepare('SELECT code_verifier FROM login_transactions WHERE state_hash=?').get(b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(one.state)))).code_verifier;
 const challenge=b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 assert.equal(challenge,one.url.searchParams.get('code_challenge'));
});
test('The callback rejects missing cookies, state mismatches and replayed login attempts',async()=>{
 const env=setup(),tx=await begin(env);
 await assert.rejects(finishLogin(new Request(origin+'/auth/callback?state='+tx.state+'&code=auth-code'),env),/transaction mismatch/);
 await assert.rejects(finishLogin(new Request(origin+'/auth/callback?state=wrong&code=auth-code',{headers:{cookie:tx.cookie}}),env),/transaction mismatch/);
 await finish(env,tx);
 await assert.rejects(finishLogin(new Request(origin+'/auth/callback?'+new URLSearchParams({state:tx.state,code:'auth-code'}),{headers:{cookie:tx.cookie}}),env,{fetcher:providerFetch(()=>issueToken('candidate',tx.nonce))}),/expired|consumed/);
});
test('Invalid nonce and wrong audience are denied without creating a browser session',async()=>{
 const env=setup(),tx=await begin(env);
 await assert.rejects(finishLogin(new Request(origin+'/auth/callback?'+new URLSearchParams({state:tx.state,code:'auth-code'}),{headers:{cookie:tx.cookie}}),env,{fetcher:providerFetch(()=>issueToken('candidate','wrong-nonce'))}),/nonce/);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM browser_sessions').get().n,0);
});
test('Browser login creates an encrypted-token-free, revocable HttpOnly session',async()=>{
 const env=setup(),tx=await begin(env),{response,cookie,cookies}=await finish(env,tx);
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),origin+'/join');
 assert.ok(cookies.some(c=>c.includes('Secure; HttpOnly; SameSite=Lax')));
 const raw=cookie.split('=')[1];
 assert.ok(!JSON.stringify(env.sqlite.prepare('SELECT * FROM browser_sessions').get()).includes(raw));
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM tenant_accounts').get().n,1);
 const req=new Request(origin+'/auth/session',{headers:{cookie}});
 const user=await describeSession(req,env);assert.equal(user.signed_in,true);assert.equal(user.email,'candidate@example.com');
 assert.equal((await sessionIdentity(req,env)).tenantId,user.tenant_id);
 assert.match(user.csrf,/^[a-zA-Z0-9_-]{43}$/);
 await assert.rejects(sessionIdentity(new Request(origin+'/api/v2/profile',{method:'POST',headers:{cookie}}),env),/Cross-origin/);
 await assert.rejects(sessionIdentity(new Request(origin+'/api/v2/profile',{method:'POST',headers:{cookie,origin}}),env),/CSRF/);
 const good=new Request(origin+'/api/v2/profile',{method:'POST',headers:{cookie,origin,'x-oc-csrf':user.csrf}});
 assert.equal((await identityForAPI(good,env)).tenantId,user.tenant_id);
 const bad=new Request(origin+'/api/v2/profile',{method:'POST',headers:{cookie,origin:'https://attacker.example.com','x-oc-csrf':user.csrf}});
 await assert.rejects(identityForAPI(bad,env),/Cross-origin/);
 const logged=await logout(new Request(origin+'/auth/logout',{method:'POST',headers:{cookie,origin,'x-oc-csrf':user.csrf}}),env);
 assert.equal(logged.status,200);assert.match(logged.headers.get('set-cookie'),/Max-Age=0/);
 await assert.rejects(sessionIdentity(req,env),/expired|revoked/);
});
test('Two sign-ins remain isolated and forged Authorization headers never fall back to cookies',async()=>{
 const env=setup(),one=await begin(env),a=await finish(env,one,'candidate-a'),two=await begin(env),b=await finish(env,two,'candidate-b');
 const aIdentity=await sessionIdentity(new Request(origin+'/api/v2/me',{headers:{cookie:a.cookie}}),env);
 const bIdentity=await sessionIdentity(new Request(origin+'/api/v2/me',{headers:{cookie:b.cookie}}),env);
 assert.notEqual(aIdentity.tenantId,bIdentity.tenantId);
 await assert.rejects(identityForAPI(new Request(origin+'/api/v2/me',{headers:{cookie:a.cookie,authorization:'Bearer forged.token.value'}}),env),/JWT|token|signature|Malformed|bearer/i);
});
