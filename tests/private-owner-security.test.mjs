import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {assertPrivateOwner} from '../lib/private-owner.mjs';

test('Private owner must be explicitly configured, not claimed by first visitor',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE configuration(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
 const db={prepare(sql){return {async first(){return sqlite.prepare(sql).get()||null;}}}};
 await assert.rejects(()=>assertPrivateOwner(db,'test-user'),/not provisioned/);
 sqlite.prepare('INSERT INTO configuration(key,value) VALUES(?,?)').run('owner_chatgpt_user_id',JSON.stringify('authorized-owner'));
 await assertPrivateOwner(db,'authorized-owner');
 await assert.rejects(()=>assertPrivateOwner(db,'other-user'),/different account/);
});
const protectedRoutes=[
 'app/api/[...path]/route.ts',
 'app/mcp/route.ts',
 'app/api/mvp/consent/route.ts',
 'app/api/mvp/applications/route.ts',
];
test('RELEASE GATE: every private HTTP and MCP route enforces the explicit owner',()=>{
 const missing=protectedRoutes.filter(path=>!/\bawait\s+assertPrivateOwner\s*\(/.test(readFileSync(path,'utf8')));
 assert.deepEqual(missing,[], 'Private owner is NOT wired into: '+missing.join(', '));
});
test('RELEASE GATE: older REST and MCP routes explicitly gate private reads',()=>{
 const rest=readFileSync(protectedRoutes[0],'utf8');
 const mcp=readFileSync(protectedRoutes[1],'utf8');
 assert.match(rest,/if\(method==='GET'\)await workflow\.assert\('research:read'\)/);
 assert.match(mcp,/Legacy tools can expose private CV bytes/);
});
