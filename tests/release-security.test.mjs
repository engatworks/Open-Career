import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {accessMode,legacyAllowed,multiuserAllowed,assertLegacyAllowed,assertMultiuserAllowed,assertOnboardingAllowed,parseBetaAllowlist,throttleSignIn,throttleTenant,consumeLimit,AccessError} from '../lib/release-security.mjs';
const user=(letter)=>({tenantId:'usr_'+letter.repeat(43),email:letter+'@example.com'});
const key=Buffer.alloc(32,7).toString('base64url');
function env(mode,allowlist='a@example.com'){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){
  db.exec(fs.readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));
 }
 const DB={prepare(sql){let vals=[];const bound={bind(...args){vals=args;return bound;},async first(){return db.prepare(sql).get(...vals)||null;},async all(){return {results:db.prepare(sql).all(...vals)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...vals).changes)}};}};return bound;}};
 return {OPENCAREER_ACCESS_MODE:mode,OPENCAREER_BETA_EMAIL_ALLOWLIST:allowlist,OPENCAREER_SESSION_SECRET:key,DB,raw:db};
}
test('Deployment modes fail closed unless operator explicitly configures a supported mode',()=>{
 assert.equal(accessMode({}),'disabled');
 assert.equal(accessMode({OPENCAREER_ACCESS_MODE:'owner_prviate'}),'disabled');
 for(const mode of ['disabled','multiuser_beta','multiuser_public']){
  assert.equal(legacyAllowed({OPENCAREER_ACCESS_MODE:mode}),false);
  assert.throws(()=>assertLegacyAllowed({OPENCAREER_ACCESS_MODE:mode}),AccessError);
 }
 assert.equal(legacyAllowed({OPENCAREER_ACCESS_MODE:'owner_private'}),true);
 assert.equal(multiuserAllowed({OPENCAREER_ACCESS_MODE:'owner_private'}),false);
 assert.throws(()=>assertMultiuserAllowed({}),AccessError);
 assert.equal(multiuserAllowed({OPENCAREER_ACCESS_MODE:'multiuser_beta'}),true);
});
test('Uninvited and unverified identities cannot create beta accounts',async()=>{
 const e=env('multiuser_beta');
 await assert.rejects(assertOnboardingAllowed(e,user('b')),/invited/);
 await assert.rejects(assertOnboardingAllowed(e,{...user('a'),email:null}),/verified email/);
 await assert.doesNotReject(assertOnboardingAllowed(e,user('a')));
});
test('Beta allowlist validation refuses invalid configuration',()=>{
 assert.deepEqual([...parseBetaAllowlist('  PERSON@EXAMPLE.COM , another@example.com ')],['person@example.com','another@example.com']);
 assert.throws(()=>parseBetaAllowlist('valid@example.com,not-an-email'),/Invalid/);
 assert.equal(parseBetaAllowlist('').size,0);
});
test('Existing accounts stay accessible after the invitations close, but deleting accounts cannot re-register',async()=>{
 const e=env('multiuser_beta'),a=user('a');
 const now=new Date().toISOString();
 e.raw.prepare("INSERT INTO tenant_accounts(id,status,created_at,last_seen_at) VALUES(?,'active',?,?)").run(a.tenantId,now,now);
 e.OPENCAREER_BETA_EMAIL_ALLOWLIST='';
 await assert.doesNotReject(assertOnboardingAllowed(e,{...a,email:null}));
 e.raw.prepare("UPDATE tenant_accounts SET status='deleting' WHERE id=?").run(a.tenantId);
 await assert.rejects(assertOnboardingAllowed(e,a),/suspended|deletion/);
});
test('Public signup still requires a verified email and a server-derived tenant',async()=>{
 const e=env('multiuser_public','');
 await assert.doesNotReject(assertOnboardingAllowed(e,user('b')));
 await assert.rejects(assertOnboardingAllowed(e,{tenantId:'attacker',email:'b@example.com'}),/Verified identity/);
 await assert.rejects(assertOnboardingAllowed(e,{...user('b'),email:null}),/verified email/);
});
test('Request limits are stored durably and atomically per tenant per time window',async()=>{
 const e=env('multiuser_beta'),a=user('a'),b=user('b');
 const options={now:Date.parse('2026-10-21T00:00:00.000Z'),intervalSeconds:600};
 await throttleTenant(e,a,'ats_jobs',2,options);
 await throttleTenant(e,a,'ats_jobs',2,options);
 await assert.rejects(throttleTenant(e,a,'ats_jobs',2,options),err=>err.status===429);
 await assert.doesNotReject(throttleTenant(e,b,'ats_jobs',2,options));
 await assert.doesNotReject(throttleTenant(e,a,'ats_jobs',2,{...options,now:options.now+600000}));
});
test('Sign-in limits are keyed by a private digest, not raw visitor IP',async()=>{
 const e=env('multiuser_beta');const header=new Headers({'cf-connecting-ip':'198.51.100.2'});
 for(let i=0;i<12;i++)await throttleSignIn(new Request('https://career.example.com/auth/start',{headers:header}),e,{now:1000000000});
 await assert.rejects(throttleSignIn(new Request('https://career.example.com/auth/start',{headers:header}),e,{now:1000000000}),err=>err.status===429);
 const rows=e.raw.prepare("SELECT bucket FROM request_limits").all();
 assert.equal(rows.length,1);
 assert.ok(!rows[0].bucket.includes('198.51.100.2'));
 await assert.doesNotReject(throttleSignIn(new Request('https://career.example.com/auth/start',{headers:{'cf-connecting-ip':'198.51.100.3'}}),e,{now:1000000000}));
});
test('Misconfigured request limits are rejected rather than silently unlimited',async()=>{
 const e=env('multiuser_beta');await assert.rejects(consumeLimit(e,{scope:'unsafe scope',owner:'12345678',max:30}),/Invalid/);
 await assert.rejects(consumeLimit(e,{scope:'ats',owner:'short',max:30}),/Invalid/);
 await assert.rejects(consumeLimit(e,{scope:'ats',owner:'long-enough',max:0}),/Invalid/);
});

test('Source-level owner-private boundary blocks legacy API and MCP before accessing personal data',()=>{
 const api=fs.readFileSync('app/api/[...path]/route.ts','utf8');
 const mcp=fs.readFileSync('app/mcp/route.ts','utf8');
 const homepage=fs.readFileSync('app/page.tsx','utf8');
 assert.ok(api.indexOf('if(!legacyAllowed(env))')>0);
 assert.ok(api.indexOf('if(!legacyAllowed(env))')<api.indexOf('new Career(env)'));
 assert.ok(mcp.indexOf('if(!legacyAllowed(env))')>0);
 assert.ok(mcp.indexOf('if(!legacyAllowed(env))')<mcp.indexOf('JSON.parse('));
 assert.ok(homepage.includes("redirect('/join')"));
});
test('Public ATS search is authenticated and no longer uses the owner-private API route',()=>{
 const ui=fs.readFileSync('app/join/join-client.tsx','utf8');
 const v2=fs.readFileSync('app/api/v2/[...path]/route.ts','utf8');
 assert.ok(ui.includes('/api/v2/ats/jobs'));
 assert.ok(v2.includes("if(request.method==='GET'&&path==='ats/jobs')"));
 assert.ok(v2.includes("throttleTenant(env,identity,'ats_jobs'"));
});
