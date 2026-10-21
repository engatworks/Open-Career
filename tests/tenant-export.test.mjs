import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {TenantExport} from '../lib/tenant-export.mjs';
const tenant=i=>'usr_'+i.repeat(43);
function env(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const filename of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+filename,'utf8').replaceAll('--> statement-breakpoint',''));
 const db={prepare(q){let args=[];const b={bind(...v){args=v;return b},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}}}};return b}};
 for(const id of [tenant('a'),tenant('b')])sql.prepare("INSERT INTO tenant_accounts(id,status,created_at,last_seen_at) VALUES(?,'active','2026-10-21','2026-10-21')").run(id);
 const workspace=id=>({db,id,async account(){return sql.prepare('SELECT * FROM tenant_accounts WHERE id=?').get(id)},async me(){return this.account()},async profile(){return null},async cvInfo(){return null}});
 return {sql,db,workspace};
}
test('Large workspace export is fully traversable with bounded tenant-specific cursors',async()=>{
 const {sql,workspace}=env(),a=tenant('a'),b=tenant('b');
 const events=sql.prepare("INSERT INTO tenant_events(tenant_id,at,kind,detail) VALUES(?,'2026-10-21','test','{}')");
 const contact=sql.prepare("INSERT INTO tenant_contacts(id,tenant_id,email,name,company,role,status,created_at,updated_at) VALUES(?,?,?,?,?,'Engineer','unverified','2026-10-21','2026-10-21')");
 const app=sql.prepare("INSERT INTO ats_applications(id,tenant_id,job_key,provider,board,job_id,title,apply_url,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'https://example.com','discovered','2026-10-21','2026-10-21')");
 const board=sql.prepare("INSERT INTO tenant_boards(id,tenant_id,provider,board,region,label,source_url,created_at) VALUES(?,?, 'greenhouse','acme','global','Acme','https://example.com','2026-10-21')");
 const jobs=sql.prepare("INSERT INTO tenant_job_sightings(tenant_id,board_id,job_key,title,location,apply_url,first_seen_at,last_seen_at,status) VALUES(?,?,?,'Engineer','Dublin','https://example.com','2026-10-21','2026-10-21','known')");
 board.run('board-a',a);board.run('board-b',b);
 for(let i=0;i<2150;i++)events.run(a);
 for(let i=0;i<515;i++)contact.run('a-'+String(i).padStart(4,'0'),a,'a'+i+'@example.com','Person '+i,'Acme');
 for(let i=0;i<133;i++)app.run('app-'+i,a,'greenhouse:acme:'+i,'greenhouse','acme',String(i),'Engineer '+i);
 for(let i=0;i<315;i++)jobs.run(a,'board-a','greenhouse:acme:'+i);
 events.run(b);contact.run('b-private',b,'secret@example.com','Other user','Other');
 jobs.run(b,'board-b','greenhouse:acme:private');
 const exportA=new TenantExport(workspace(a)),manifest=await exportA.manifest();
 assert.deepEqual(manifest.counts,{contacts:515,applications:133,employer_boards:1,observed_jobs:315,events:2150});
 assert.equal(manifest.snapshot_consistent,false);
 for(const [collection,total] of Object.entries(manifest.counts)){
  let cursor=null,all=[],n=0;
  do{const page=await exportA.page({collection,cursor,limit:137});assert.equal(page.collection,collection);assert.ok(page.items.length<=137);all.push(...page.items);cursor=page.next_cursor;assert.ok(++n<40)}while(cursor);
  assert.equal(all.length,total,collection);
  if(all.length)assert.ok(all.every(row=>row.tenant_id===a));
 }
 const exportB=new TenantExport(workspace(b));
 assert.deepEqual((await exportB.manifest()).counts,{contacts:1,applications:0,employer_boards:1,observed_jobs:1,events:1});
 assert.equal((await exportB.page({collection:'contacts'})).items[0].email,'secret@example.com');
});
test('Export refuses invalid collections, unbounded pages and cursor injection',async()=>{
 const {workspace}=env(),x=new TenantExport(workspace(tenant('a')));
 await assert.rejects(x.page({collection:'tenant_accounts'}),/Invalid export collection/);
 await assert.rejects(x.page({collection:'contacts; DROP TABLE tenant_accounts',limit:1}),/Invalid export collection/);
 await assert.rejects(x.page({collection:'events',cursor:'-1'}),/Invalid export cursor/);
 await assert.rejects(x.page({collection:'events',cursor:'NaN'}),/Invalid export cursor/);
 await assert.rejects(x.page({collection:'contacts',limit:1000000}),/Invalid export page limit/);
});
