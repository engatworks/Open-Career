import test from 'node:test';
import assert from 'node:assert/strict';
import { TERMS_VERSION, SCOPES, checkActionGrant, applicationIdempotencyKey } from '../lib/mvp-consent.mjs';

const grant = {
  accountId:'candidate-a', termsAccepted:true, termsVersion:TERMS_VERSION,
  acceptedAt:'2026-10-19T00:00:00Z', scopes:['email:send','applications:submit'],
};
const base = {
  grant, accountId:'candidate-a', scope:'email:send',
  now:new Date('2026-10-20T00:00:00Z'), providerAllowsAction:true,
};
test('accepts explicitly granted verified outgoing action', () => {
  assert.deepEqual(checkActionGrant(base),{allowed:true,mustPause:false,reason:'authorized'});
});
test('rejects unknown action and implicit wildcard', () => {
  assert.equal(checkActionGrant({...base,scope:'delete:everything'}).reason,'unknown_scope');
  assert.equal(checkActionGrant({...base,grant:{...grant,scopes:['*']}}).reason,'scope_not_granted');
  assert.ok(SCOPES.length >= 8);
});
test('rejects absent, stale and cross-account consent', () => {
  assert.equal(checkActionGrant({...base,grant:null}).reason,'terms_not_accepted');
  assert.equal(checkActionGrant({...base,grant:{...grant,termsVersion:'old'}}).reason,'terms_not_accepted');
  assert.equal(checkActionGrant({...base,accountId:'other-user'}).reason,'wrong_account');
});
test('rejects missing scope, revoked grant and future acceptance', () => {
  assert.equal(checkActionGrant({...base,scope:'email:reply'}).reason,'scope_not_granted');
  assert.equal(checkActionGrant({...base,grant:{...grant,revokedAt:'2026-10-19T01:00:00Z'}}).reason,'grant_revoked');
  assert.equal(checkActionGrant({...base,grant:{...grant,acceptedAt:'2026-10-21T00:00:00Z'}}).reason,'invalid_acceptance_timestamp');
});
test('pauses or blocks on provider permissions and host challenges', () => {
  assert.deepEqual(checkActionGrant({...base,providerAllowsAction:null}),{allowed:false,mustPause:true,reason:'provider_permission_unverified'});
  assert.equal(checkActionGrant({...base,providerAllowsAction:false}).reason,'provider_disallows_action');
  assert.equal(checkActionGrant({...base,hostApprovalRequired:true}).reason,'host_approval_required');
  assert.equal(checkActionGrant({...base,securityChallenge:true}).reason,'human_verification_required');
  assert.equal(checkActionGrant({...base,payloadReviewed:false}).reason,'payload_review_required');
});
test('deduplication key includes candidate, employer and job, never employer alone', () => {
  assert.equal(applicationIdempotencyKey({accountId:'Candidate-A',companyDomain:'Example.com',atsJobId:'0123'}),'candidate-a|example.com|id:0123');
  assert.throws(()=>applicationIdempotencyKey({accountId:'candidate-a',companyDomain:'example.com'}));
  assert.throws(()=>applicationIdempotencyKey({accountId:'candidate-a',companyDomain:'example.com',vacancyUrl:'http://example.com/jobs'}));
});
