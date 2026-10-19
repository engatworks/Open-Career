/**
 * Open Career MVP explicit-consent decision helper.
 * NOTE: This helper does not by itself authorize external actions. Enforce grants
 * at the authenticated API boundary and check host/provider permissions too.
 */
export const TERMS_VERSION = 'mvp-2026-10-19-v1';
export const SCOPES = Object.freeze([
  'research:read','applications:prepare','applications:submit','accounts:create',
  'email:read','email:send','email:reply',
  'records:write','followups:send',
]);
const KNOWN = new Set(SCOPES);
const rejected = reason => ({ allowed:false, mustPause:false, reason });
const paused = reason => ({ allowed:false, mustPause:true, reason });

export function checkActionGrant({
  grant, accountId, scope, now = new Date(), providerAllowsAction = null,
  hostApprovalRequired = false, securityChallenge = false, payloadReviewed = true,
} = {}) {
  if (!KNOWN.has(scope)) return rejected('unknown_scope');
  if (!grant || grant.termsAccepted !== true || grant.termsVersion !== TERMS_VERSION)
    return rejected('terms_not_accepted');
  if (typeof accountId !== 'string' || !accountId.trim() || grant.accountId !== accountId)
    return rejected('wrong_account');
  const accepted = new Date(grant.acceptedAt);
  if (Number.isNaN(accepted.getTime()) || accepted.getTime() > new Date(now).getTime())
    return rejected('invalid_acceptance_timestamp');
  if (grant.revokedAt) return rejected('grant_revoked');
  if (!Array.isArray(grant.scopes) || !grant.scopes.includes(scope))
    return rejected('scope_not_granted');
  if (providerAllowsAction === false) return rejected('provider_disallows_action');
  if (providerAllowsAction !== true) return paused('provider_permission_unverified');
  if (hostApprovalRequired) return paused('host_approval_required');
  if (securityChallenge) return paused('human_verification_required');
  if (!payloadReviewed) return paused('payload_review_required');
  return { allowed:true, mustPause:false, reason:'authorized' };
}

export function applicationIdempotencyKey({ accountId, companyDomain, atsJobId, vacancyUrl }) {
  for (const value of [accountId, companyDomain])
    if (typeof value !== 'string' || !value.trim())
      throw Error('Account and employer domain are required');
  const job = typeof atsJobId === 'string' && atsJobId.trim()
    ? 'id:' + atsJobId.trim()
    : typeof vacancyUrl === 'string' && /^https:\/\//i.test(vacancyUrl)
      ? 'url:' + vacancyUrl.trim() : null;
  if (!job) throw Error('Verified ATS job ID or HTTPS vacancy URL required');
  return accountId.trim().toLowerCase() + '|' + companyDomain.trim().toLowerCase() + '|' + job;
}
