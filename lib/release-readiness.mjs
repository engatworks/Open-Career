// Private, non-mutating deployment preflight. Not a security certification.
// Only call through the separately protected operator endpoint.
import {multiuserAllowed,accessMode} from './release-security.mjs';
import {loginAvailability} from './browser-auth.mjs';
import {activeCVKeyId} from './cv-crypto.mjs';

const REQUIRED_TABLES=Object.freeze([
 'tenant_accounts','tenant_identities','tenant_documents','tenant_profiles',
 'tenant_contacts','tenant_events','ats_applications','tenant_boards',
 'tenant_job_sightings','tenant_maintenance','browser_sessions',
 'login_transactions','request_limits'
]);
export async function inspectReleaseReadiness(env){
 const checks={
  public_tenant_mode:multiuserAllowed(env),
  secure_oidc_configuration:false,
  versioned_cv_keyring:false,
  required_migrations:false,
  account_identity_mapping_complete:false,
  r2_storage_binding:false,
  protected_scheduler_secret_configured:false,
 };
 checks.secure_oidc_configuration=checks.public_tenant_mode&&await loginAvailability(env);
 try{checks.versioned_cv_keyring=!!activeCVKeyId(env);}catch{checks.versioned_cv_keyring=false;}
 checks.r2_storage_binding=['put','get','delete','list'].every(method=>typeof env?.BUCKET?.[method]==='function');
 checks.protected_scheduler_secret_configured=typeof env?.OPENCAREER_WATCH_CRON_SECRET==='string'&&/^[A-Za-z0-9_-]{43}$/.test(env.OPENCAREER_WATCH_CRON_SECRET);
 let unmapped_active_accounts=null;
 if(env?.DB?.prepare){
  try{
   const rows=(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${REQUIRED_TABLES.map(()=>'?').join(',')})`).bind(...REQUIRED_TABLES).all()).results;
   checks.required_migrations=REQUIRED_TABLES.every(table=>rows.some(row=>row.name===table));
   if(checks.required_migrations){
    const row=await env.DB.prepare(`SELECT COUNT(*) AS total FROM tenant_accounts a WHERE a.status='active'
     AND NOT EXISTS(SELECT 1 FROM tenant_identities i WHERE i.tenant_id=a.id)`).first();
    unmapped_active_accounts=Number(row?.total);
    checks.account_identity_mapping_complete=Number.isSafeInteger(unmapped_active_accounts)&&unmapped_active_accounts===0;
   }
  }catch{checks.required_migrations=false;checks.account_identity_mapping_complete=false;}
 }
 const blocking_checks=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
 return {
  environment:accessMode(env),
  source_preflight_passed:blocking_checks.length===0,
  ready_for_commercial_launch:false,
  checks,unmapped_active_accounts,blocking_checks,
  orphan_gc_enabled:env?.OPENCAREER_ORPHAN_GC_ENABLED==='true',
  critical_external_gates:[
   'Real hosted OIDC sign-in and browser/REST/MCP isolation tests with two accounts',
   'Independent penetration test and operator-controlled secrets/key recovery',
   'Live D1/R2 concurrent and outage/restore tests, plus scheduler delivery confirmation',
   'Privacy, legal, customer support, billing and accessibility verification',
   'Provider-policy-compliant application submission pilot with verified receipts'
  ],
  notice:'This preflight checks local configuration and database metadata only. It does not access external identity providers, verify Cloudflare access gates, test cron execution, certify security or authorize public billing.'
 };
}
