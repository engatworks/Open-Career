import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {BoardWatch} from '../lib/board-watch.mjs';
import {authorizeWatchScheduler,runScheduledWatches} from '../lib/watch-scheduler.mjs';
const owner=id=>'usr_'+id.repeat(43);
function storage(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));
 const DB={
  prepare(sql){let params=[];const stmt={bind(...values){params=values;return stmt;},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return {results:sqlite.prepare(sql).all(...params)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}};}};return stmt;},
  async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const stmt of statements)out.push(await stmt.run());sqlite.exec('COMMIT');return out;}catch(error){sqlite.exec('ROLLBACK');throw error;}}
 };
 for(const id of [owner('a'),owner('b')])sqlite.prepare("INSERT INTO tenant_accounts(id,status,created_at,last_seen_at) VALUES(?,'active','2026-10-21','2026-10-21')").run(id);
 return {sqlite,DB};
}
const record=(id,title='Engineer')=>({job_key:'greenhouse:acme:'+id,provider:'greenhouse',board:'acme',job_id:id,title,location:'Dublin',apply_url:'https://boards.greenhouse.io/acme/jobs/'+id});
const board={provider:'greenhouse',board:'acme',label:'Acme Engineering'};
test('Employer board registration validates official ATS sources and is tenant-scoped',async()=>{
 const {DB}=storage(),a=new BoardWatch(DB,owner('a')),b=new BoardWatch(DB,owner('b'));
 const result=await a.save(board);
 assert.equal(result.created,true);
 assert.equal((await a.save(board)).created,false);
 assert.equal((await a.boards()).length,1);
 assert.equal((await b.boards()).length,0);
 await assert.rejects(a.save({provider:'greenhouse',board:'../admin',label:'Invalid'}),/Invalid board/);
 await assert.rejects(a.save({provider:'not-ats',board:'acme',label:'Unrecognized'}),/Unsupported ATS/);
 assert.equal((await b.save(board)).created,true);
 await assert.rejects(b.remove(result.board.id),/not found/);
});
test('A first scan baselines jobs; later scans flag only new ones, without duplicate alerts',async()=>{
 const {DB}=storage();let time=Date.parse('2026-10-21T10:00:00.000Z'),list=[record('1'),record('2')];
 const watch=new BoardWatch(DB,owner('a'),{clock:()=>new Date(time).toISOString(),discover:async()=>({jobs:list})});
 const {board:saved}=await watch.save(board);
 const first=await watch.scan(saved.id);
 assert.deepEqual({baseline:first.baseline,found:first.found,new:first.newly_detected},{baseline:true,found:2,new:0});
 assert.equal((await watch.listings({status:'known'})).length,2);
 await assert.rejects(watch.scan(saved.id),/recently/);
 time+=11*60*1000;list=[record('1'),record('2'),record('3','New Automation Engineer')];
 const next=await watch.scan(saved.id);
 assert.equal(next.newly_detected,1);
 assert.equal((await watch.listings({status:'new'})).length,1);
 time+=11*60*1000;
 const again=await watch.scan(saved.id);
 assert.equal(again.newly_detected,0);
 assert.equal((await watch.listings({status:'new'})).length,1);
 assert.equal((await watch.markSeen('greenhouse:acme:3')).updated,true);
 assert.equal((await watch.markSeen('greenhouse:acme:3')).updated,false);
 assert.equal((await watch.listings({status:'new'})).length,0);
 assert.equal((await watch.listings({status:'seen'})).length,1);
 const stats=(await watch.boards())[0];assert.equal(stats.new_count,0);
});
test('User A cannot scan, delete or acknowledge user B board or observations',async()=>{
 const {DB}=storage(),a=new BoardWatch(DB,owner('a'),{discover:async()=>({jobs:[record('1')]})}),b=new BoardWatch(DB,owner('b'),{discover:async()=>({jobs:[record('1')]})});
 const first=await a.save(board);const other=await b.save(board);
 await a.scan(first.board.id);
 assert.equal((await b.listings()).length,0);
 await assert.rejects(b.scan(first.board.id),/not found/);
 assert.equal((await b.markSeen('greenhouse:acme:1')).updated,false);
 await assert.rejects(a.remove(other.board.id),/not found/);
 assert.equal((await a.boards()).length,1);
});
test('A failed provider fetch preserves the previous successful baseline and error evidence',async()=>{
 const {DB}=storage();let time=Date.parse('2026-10-21T10:00:00.000Z'),fail=false;
 const a=new BoardWatch(DB,owner('a'),{clock:()=>new Date(time).toISOString(),discover:async()=>{if(fail)throw Error('Provider HTTP 503');return {jobs:[record('1')]}}});
 const {board:saved}=await a.save(board);
 await a.scan(saved.id);time+=11*60*1000;fail=true;
 await assert.rejects(a.scan(saved.id),/503/);
 const b=(await a.boards())[0];assert.match(b.last_error,/503/);assert.ok(b.last_success_at);
 assert.equal((await a.listings()).length,1);
});
test('Board removal cascades its sightings and leaves other tenants untouched',async()=>{
 const {DB}=storage(),a=new BoardWatch(DB,owner('a'),{discover:async()=>({jobs:[record('1')]})}),b=new BoardWatch(DB,owner('b'),{discover:async()=>({jobs:[record('1')]})});
 const x=await a.save(board),y=await b.save(board);
 await a.scan(x.board.id);await b.scan(y.board.id);
 assert.equal((await a.listings()).length,1);assert.equal((await b.listings()).length,1);
 await a.remove(x.board.id);
 assert.equal((await a.listings()).length,0);assert.equal((await b.listings()).length,1);
});
test('Board registration has a hard per-tenant cap and does not allow arbitrary HTTP fetching',async()=>{
 const {DB}=storage(),watch=new BoardWatch(DB,owner('a'));
 for(let i=0;i<25;i++){const r=await watch.save({provider:'lever',board:'company'+i,label:'Company '+i});assert.equal(r.created,true);}
 await assert.rejects(watch.save({provider:'lever',board:'company26',label:'Company 26'}),/full/);
 assert.equal((await watch.boards()).length,25);
 await assert.rejects(watch.save({provider:'greenhouse',board:'http://169.254.0.1',label:'Internal'}),/Invalid board/);
});

test('Background scanning is opt-in, owner-scoped and disabled by default',async()=>{
 const {DB}=storage(),a=new BoardWatch(DB,owner('a')),b=new BoardWatch(DB,owner('b'));
 const x=await a.save(board),y=await b.save(board);
 assert.equal((await a.boards())[0].auto_scan,0);
 await assert.rejects(b.setAutoScan(x.board.id,true),/not found/);
 assert.equal((await a.setAutoScan(x.board.id,true)).auto_scan,true);
 assert.equal((await a.boards())[0].auto_scan,1);
 assert.equal((await b.boards())[0].auto_scan,0);
 await a.setAutoScan(x.board.id,false);
 assert.equal((await a.boards())[0].auto_scan,0);
 await b.setAutoScan(y.board.id,true);assert.equal((await b.boards())[0].auto_scan,1);
});
test('A trusted secret gates the bounded cloud scheduler; only opted-in boards are scanned',async()=>{
 const {DB}=storage(),secret=Buffer.alloc(32,21).toString('base64url');
 const env={DB,OPENCAREER_ACCESS_MODE:'multiuser_beta',OPENCAREER_WATCH_CRON_SECRET:secret};
 const a=new BoardWatch(DB,owner('a')),b=new BoardWatch(DB,owner('b'));
 const first=await a.save(board),second=await b.save(board);
 await a.setAutoScan(first.board.id,true);
 const real=new Request('https://career.example.com/api/internal/watch-scan',{method:'POST',headers:{authorization:'Bearer '+secret}});
 assert.equal(authorizeWatchScheduler(real,env),true);
 assert.throws(()=>authorizeWatchScheduler(new Request('https://career.example.com/api/internal/watch-scan',{method:'POST',headers:{authorization:'Bearer wrong'}}),env),/Unauthorized/);
 assert.throws(()=>authorizeWatchScheduler(new Request('https://career.example.com/api/internal/watch-scan',{method:'POST',headers:{origin:'https://career.example.com',authorization:'Bearer '+secret}}),env),/browser/);
 assert.throws(()=>authorizeWatchScheduler(real,{...env,OPENCAREER_ACCESS_MODE:'owner_private'}),/not enabled/);
 let jobs=[record('1')],calls=0,time=Date.parse('2026-10-21T10:00:00.000Z');
 const discover=async()=>{calls++;return {jobs}};
 const baseline=await runScheduledWatches(env,{discover,now:()=>time});
 assert.deepEqual(baseline,{selected:1,completed:1,failed:0,newly_detected:0,baseline_scans:1,account_cleanup:{selected:0,completed:0,failed:0},orphan_cleanup:{enabled:false},retention_cleanup:{throttles:0,sessions:0,login_transactions:0}});
 assert.equal(calls,1);
 assert.equal((await b.boards())[0].last_success_at,null);
 assert.equal((await runScheduledWatches(env,{discover,now:()=>time})).selected,0);
 time+=61*60*1000;jobs=[record('1'),record('2')];
 const next=await runScheduledWatches(env,{discover,now:()=>time});
 assert.equal(next.newly_detected,1);assert.equal((await a.listings({status:'new'})).length,1);
 await a.setAutoScan(first.board.id,false);
 time+=61*60*1000;
 assert.equal((await runScheduledWatches(env,{discover,now:()=>time})).selected,0);
 assert.equal((await a.boards())[0].auto_scan,0);
});

test('A revoked monitoring opt-in blocks a queued scheduled fetch before reaching its provider',async()=>{
 const {DB}=storage();let calls=0;
 const a=new BoardWatch(DB,owner('a'),{discover:async()=>{calls++;return {jobs:[record('1')]}}});
 const saved=await a.save(board);
 await a.setAutoScan(saved.board.id,true);
 await a.setAutoScan(saved.board.id,false);
 await assert.rejects(a.scan(saved.board.id,{requireOptIn:true}),/consent/);
 assert.equal(calls,0);
 await a.scan(saved.board.id); // A user-initiated manual scan still works without opt-in.
 assert.equal(calls,1);
});

test('Scheduled housekeeping expires only stale auth and throttle state, not active sessions',async()=>{
 const {DB,sqlite}=storage(),secret=Buffer.alloc(32,21).toString('base64url');
 const env={DB,OPENCAREER_ACCESS_MODE:'multiuser_beta',OPENCAREER_WATCH_CRON_SECRET:secret};
 const time=Date.parse('2026-10-21T10:00:00.000Z');
 sqlite.prepare("INSERT INTO browser_sessions(token_hash,tenant_id,created_at,expires_at) VALUES(?,?,?,?)").run('expired',owner('a'),'2026-10-01','2026-10-20');
 sqlite.prepare("INSERT INTO browser_sessions(token_hash,tenant_id,created_at,expires_at) VALUES(?,?,?,?)").run('valid',owner('a'),'2026-10-21','2026-10-22');
 sqlite.prepare("INSERT INTO login_transactions(state_hash,code_verifier,nonce,expires_at) VALUES('expired','x','nonce','2026-10-01')").run();
 sqlite.prepare("INSERT INTO login_transactions(state_hash,code_verifier,nonce,expires_at) VALUES('valid','x','nonce','2026-10-22')").run();
 sqlite.prepare("INSERT INTO request_limits(bucket,count,expires_at) VALUES('expired:abcdefgh',1,?)").run(time-2*86400000);
 const result=await runScheduledWatches(env,{now:()=>time});
 assert.deepEqual(result.retention_cleanup,{throttles:1,sessions:1,login_transactions:1});
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM browser_sessions").get().n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM login_transactions").get().n,1);
});
