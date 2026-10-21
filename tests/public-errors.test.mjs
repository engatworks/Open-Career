import test from 'node:test';
import assert from 'node:assert/strict';
import {publicFailure} from '../lib/public-errors.mjs';
import {AccessError} from '../lib/release-security.mjs';
import {IdentityError} from '../lib/tenant-identity.mjs';

test('Public responses never expose storage configuration or database implementation errors',()=>{
 const secrets=[
  Error('D1_ERROR: no such table tenant_accounts'),
  Error('R2 Binding permission denied for bucket private-cv-uploads'),
  Error('Failed to decrypt AES-GCM content under internal key'),
  Error('Cloudflare request to internal service at 10.0.0.1 failed'),
  Error('Unexpected stack: at /workspace/private/customer.js'),
 ];
 for(const problem of secrets){
  const failure=publicFailure(problem);
  assert.equal(failure.status,503);
  assert.equal(failure.message,'Service temporarily unavailable. Please retry later or contact support.');
  assert.ok(!failure.message.includes('D1_ERROR'));
 }
});
test('Expected user errors retain safe, actionable status codes',()=>{
 assert.deepEqual(publicFailure(new AccessError('Request limit reached',429)),{status:429,message:'Request limit reached'});
 assert.deepEqual(publicFailure(new IdentityError('Session expired')), {status:401,message:'Session expired'});
 assert.deepEqual(publicFailure(Error('Profile changed in another session. Reload and merge your changes.')),{status:409,message:'Profile changed in another session. Reload and merge your changes.'});
 assert.equal(publicFailure(Error('CV was changed concurrently or account is inactive. Reload and retry.')).status,409);
 assert.deepEqual(publicFailure(new SyntaxError('Unexpected token')), {status:400,message:'Malformed request JSON'});
 assert.equal(publicFailure(Error('ATS board unavailable: HTTP 503')).status,502);
});
test('Client-provided error strings cannot cause unbounded error disclosures',()=>{
 const error=Error('Unsupported provider '+ 'X'.repeat(10000));
 const failure=publicFailure(error);
 assert.ok(failure.message.length<=240);
});
