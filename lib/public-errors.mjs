// Centralized wire-error classification. Never return arbitrary DB/R2/internal exceptions to clients.
import {IdentityError} from './tenant-identity.mjs';
import {AccessError} from './release-security.mjs';
const SAFE=[
 /^Invalid (?:board|job|email|profile|contact|source URL|scan|employer|listing|results|CV|tenant|form|application|file|monitoring|request|account|provider|ATS|candidate|evidence|deletion|OAuth|sign-in|user|work|callback|base64url|JWT)/i,
 /^Unsupported (?:ATS|profile|provider|region|job|tool)/i,
 /^A valid profile revision is required$/,
 /^Profile changed in another session\. Reload and merge your changes\.$/,
 /^CV was changed concurrently or account is inactive\. Reload and retry\.$/,
 /^CV changed concurrently\. Reload and retry\.$/,
 /^CV must be a PDF of at most 5 MB$/,
 /^CV fingerprint mismatch$/,
 /^Tenant CV fingerprint changed$/,
 /^Approved tenant CV does not match the prepared application$/,
 /^Board (?:not found|was checked|check already)/,
 /^Background scanning consent was withdrawn$/,
 /^Your board watchlist is full/,
 /^Employer label required$/,
 /^No CV uploaded$/,
 /^CV object missing$/,
 /^Contact (?:saved|unavailable|not found)/,
 /^Valid email required$/,
 /^Only public HTTPS source URLs allowed$/,
 /^Missing request body$/,
 /^Request body exceeds allowed size$/,
 /^JSON content type required$/,
 /^Explicit (?:user approval|account deletion)/,
 /^Approval refused/,
 /^Application (?:unavailable|not found)/,
 /^Cannot cancel an attempted submission$/,
 /^Submission (?:not authorized|not allowed)/,
 /^Already (?:submitted|exists)/,
 /^Unknown (?:API endpoint|MCP tool|method)$/,
 /^Job (?:saved|unavailable)/,
 /^ATS board unavailable/,
 /^Provider returned an invalid listing key$/,
 /^No matching jobs/,
 /^Account not provisioned or inactive$/,
 /^Account is suspended or deletion is in progress$/,
 /^Board not found in your workspace$/,
 /^Board check already in progress or recently attempted$/
];
export function publicFailure(error){
 if(error instanceof AccessError||error instanceof IdentityError)return {status:error.status,message:error.message};
 if(error instanceof SyntaxError)return {status:400,message:'Malformed request JSON'};
 if(error instanceof Error){
  const msg=error.message;
  if(SAFE.some(re=>re.test(msg)))return {status:/Profile changed|CV changed concurrently|CV was changed concurrently|Board check already|Board was checked|Application unavailable|already attempted/i.test(msg)?409:/ATS board unavailable/i.test(msg)?502:400,message:msg.slice(0,240)};
 }
 return {status:503,message:'Service temporarily unavailable. Please retry later or contact support.'};
}
