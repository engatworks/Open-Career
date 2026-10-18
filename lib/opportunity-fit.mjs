/**
 * Open Career Opportunity Fit: offline, explainable first-pass review.
 * This never verifies vacancy authenticity, immigration eligibility or employer policy.
 * It does not call a server, store data, or apply for jobs.
 */
export const OPPORTUNITY_TEXT_LIMIT = 24000;
const optional = /\b(preferred|desirable|nice.to.have|ideally|a plus|bonus)\b/i;
const noSponsor = [
  /\b(?:no|without)\s+(?:visa\s+|work\s+permit\s+)?sponsorship\b/i,
  /\b(?:do\s+not|don't|cannot|can't|will\s+not|won't|unable\s+to|not\s+able\s+to)\s+(?:\w+\s+){0,2}(?:offer|provide|support|sponsor)\b.{0,75}\b(?:visa|work\s+permit|sponsorship|candidates)\b/i,
  /\bsponsorship\s+(?:is\s+)?(?:not\s+available|unavailable|not\s+provided)\b/i,
  /\b(?:must|should|need\s+to)\s+(?:already\s+)?(?:have|hold|possess)\b.{0,70}\b(?:authorization|right|eligibility)\s+to\s+work\b.{0,70}\bwithout\s+(?:visa\s+)?sponsorship\b/i,
  /\b(?:must\s+not|cannot)\s+(?:require|need)\s+(?:visa\s+)?sponsorship\b/i
];
const yesSponsor = [
  /\b(?:visa|work\s+permit)\s+sponsorship\s+(?:is\s+)?(?:available|offered|provided|possible)\b/i,
  /\b(?:we|our\s+company)\s+(?:offer|provide|support)\s+(?:visa\s+|work\s+permit\s+)?sponsorship\b/i,
  /\b(?:will|can)\s+sponsor\s+(?:successful\s+)?(?:international\s+)?(?:applicants|candidates|employees)\b/i,
  /\bsponsorship\s+(?:may\s+be\s+|is\s+)?(?:available|considered)\b/i,
  /\bvisa\s+(?:and\s+)?relocation\s+(?:assistance|support)\s+(?:is\s+)?provided\b/i
];
const authorization = [
  /\bmust\s+(?:already\s+)?be\s+(?:legally\s+)?authorized\s+to\s+work\b/i,
  /\b(?:must|required\s+to)\s+(?:already\s+)?(?:have|hold|possess)\b.{0,60}\b(?:authorization|right)\s+to\s+work\b/i,
  /\b(?:only|exclusively)\s+(?:consider|accept)\s+(?:candidates|applicants)\b.{0,65}\b(?:authorized|right\s+to\s+work)\b/i
];
const geoAliases = {
  'united states':'US','usa':'US','us':'US','u.s.':'US',
  'united kingdom':'GB','uk':'GB','u.k.':'GB','britain':'GB',
  'saudi arabia':'SA','ksa':'SA','canada':'CA',
  'germany':'DE','netherlands':'NL','australia':'AU',
  'india':'IN','egypt':'EG','turkey':'TR','türkiye':'TR','european union':'EU','eu':'EU'
};
function locCode(value) {
  const s=String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  return geoAliases[s] || (Object.values(geoAliases).includes(s.toUpperCase())?s.toUpperCase():null);
}
function segments(input) {
  return input.replace(/\r/g,'\n').replace(/[•●]/g,'\n')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
}
function firstHit(parts,patterns) {
  for(const part of parts)for(const regex of patterns)if(regex.test(part))return part;
  return null;
}
function excerpt(s){return s.length>300?s.slice(0,297)+'…':s;}
const expPatterns=[
  /\b(\d{1,2})\s*\+\s*years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?experience\b/i,
  /\b(?:at\s+least|minimum\s+(?:of\s+)?|min\.?\s+)(\d{1,2})\s+years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?experience\b/i,
  /\b(?:required|require(?:s|d)?)\s*[:\-]?\s*(\d{1,2})\s+years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?experience\b/i,
  /\b(\d{1,2})\s+years?['’]?\s+(?:of\s+)?experience\s+(?:required|minimum)\b/i
];
function minimumExperience(parts){
  const found=[];
  for(const part of parts){
    if(optional.test(part))continue;
    for(const p of expPatterns){
      const m=part.match(p);
      if(m){const years=Number(m[1]);if(years>0&&years<=40)found.push({years,quote:part});break;}
    }
  }
  return found.sort((a,b)=>b.years-a.years)[0]||null;
}
const remoteOnly=[
  /\bremote(?:\s+role|\s+position|\s+work)?\s+(?:only\s+)?(?:within|in|from|for)\s+(?:the\s+)?(United States|USA|US|U\.S\.|United Kingdom|UK|U\.K\.|Canada|Saudi Arabia|KSA|Germany|Netherlands|Australia|India|European Union|EU)\b/i,
  /\b(?:remote\s+)?(?:candidates|applicants)\s+must\s+(?:be\s+)?(?:based|located|reside|living)\s+in\s+(?:the\s+)?(United States|USA|US|United Kingdom|UK|Canada|Saudi Arabia|Germany|Netherlands|Australia|India|European Union|EU)\b/i
];
/**
 * @param {{text:string,needsSponsorship?:boolean,authorizedToWork?:boolean|null,yearsExperience?:number|null,currentCountry?:string}} input
 * @returns {{verdict:string,sponsorship:string,signals:Array<{kind:string,severity:string,detail:string,quote:string}>,summary:string,disclaimer:string}}
 */
export function assessOpportunity(input){
  if(!input||typeof input.text!=='string')throw Error('Paste a job description first.');
  const text=input.text.trim();
  if(text.length<35)throw Error('A job description of at least 35 characters is required.');
  if(text.length>OPPORTUNITY_TEXT_LIMIT)throw Error('Job description exceeds the 24,000-character limit.');
  const years=input.yearsExperience==null?null:Number(input.yearsExperience);
  if(years!==null&&(!Number.isFinite(years)||years<0||years>70))throw Error('Years of experience must be between 0 and 70.');
  const parts=segments(text),signals=[];
  const add=(kind,severity,detail,quote='')=>signals.push({kind,severity,detail,quote:excerpt(quote)});
  const negative=firstHit(parts,noSponsor),positive=firstHit(parts,yesSponsor);
  let sponsorship='not-stated';
  if(negative&&positive){
    sponsorship='conflicting';
    add('sponsorship','review','Conflicting sponsorship wording. Confirm directly with the employer.',negative);
    add('sponsorship','review','Another part of the posting indicates possible sponsorship.',positive);
  }else if(negative){
    sponsorship='not-offered';
    add('sponsorship',input.needsSponsorship?'blocker':'info',input.needsSponsorship?'The posting appears to exclude sponsorship you need.':'The posting appears to exclude sponsorship.',negative);
  }else if(positive){
    sponsorship='mentioned';
    add('sponsorship','positive','The posting mentions sponsorship. This does not guarantee individual eligibility.',positive);
  }else if(input.needsSponsorship){
    add('sponsorship','review','No clear sponsorship policy found. Ask the employer rather than assuming it is available.');
  }
  const auth=firstHit(parts,authorization);
  if(auth){
    if(input.authorizedToWork===false&&input.needsSponsorship&&sponsorship!=='mentioned'){
      add('work-authorization',sponsorship==='not-offered'?'blocker':'review','Work authorization may be required before hiring; confirm if sponsorship is possible.',auth);
    }else if(input.authorizedToWork==null){
      add('work-authorization','review','Work authorization is specified. Confirm whether you meet this condition.',auth);
    }else{
      add('work-authorization','info','The posting specifies a work-authorization condition.',auth);
    }
  }
  const exp=minimumExperience(parts);
  if(exp){
    if(years===null)add('experience','review','The posting states at least '+exp.years+' years of experience; add yours to compare.',exp.quote);
    else if(years<exp.years)add('experience','blocker','The posting states '+exp.years+'+ years; you entered '+years+'. Ask about exceptions or equivalent experience.',exp.quote);
    else add('experience','positive','Your stated '+years+' years meets the '+exp.years+'-year numerical threshold; relevance is unverified.',exp.quote);
  }
  for(const part of parts){
    const match=remoteOnly.map(r=>part.match(r)).find(Boolean);
    if(!match)continue;
    const expected=locCode(match[1]),current=locCode(input.currentCountry);
    if(expected&&current&&expected!==current){
      add('location','review','This appears restricted to '+match[1]+'; your selected country differs. Verify whether relocation or cross-border work is allowed.',part);
    }else add('location','info','The posting contains a location restriction: '+match[1]+'.',part);
    break;
  }
  const verdict=signals.some(s=>s.severity==='blocker')?'likely-ineligible':signals.some(s=>s.severity==='review')?'needs-review':'no-obvious-conflict';
  const summary=verdict==='likely-ineligible'?'At least one stated condition appears incompatible with your information.':verdict==='needs-review'?'Important eligibility conditions need clarification before applying.':'No obvious conflict detected by this limited check; eligibility is not confirmed.';
  return {verdict,sponsorship,signals,summary,disclaimer:'Text-only preliminary heuristics. Not a verified vacancy, visa assessment, employer commitment, or legal advice. Check the official posting and ask the employer.'};
}
