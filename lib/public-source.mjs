import { SOURCE_CATALOG, SOURCE_POLICY, RESEARCH_ROUTES } from './source-catalog.mjs';
import { RESEARCH_CHECKLIST } from './research-review.mjs';
import { parseDocument } from 'htmlparser2';

const clean = value => String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
const emailPattern = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}/gi;
const blocks = new Set(['address','article','aside','blockquote','br','div','dl','dt','dd','footer','form','h1','h2','h3','h4','h5','h6','header','hr','li','main','nav','ol','p','section','table','td','th','tr','ul']);
const hiddenTags = new Set(['script','style','noscript','svg','template','head']);
const hidden = node => hiddenTags.has(node.name) || node.attribs && ('hidden' in node.attribs || node.attribs['aria-hidden']==='true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(node.attribs.style||''));

// Preserve inline punctuation and put each public mailto target at its own anchor.
// Never concatenate all mailboxes at the end: that loses ownership and invitation context.
export function extractPublicSource(html, sourceURL) {
  const links=[], scopes=[], mailboxes=new Set(), encodedMailboxes=new Set();
  function visit(node) {
    if(hidden(node)) return '';
    if(node.type==='text') return node.data;
    if(node.type==='comment') return '';
    let text=(node.children||[]).map(visit).join('');
    // Cloudflare's publicly shipped XOR payload is the same address its browser script displays.
    // Decode only a visible email-protection node; retain source-byte fingerprint upstream.
    const encoded=node.attribs?.['data-cfemail'];
    if(['a','span'].includes(node.name)&&((node.attribs.class||'').split(/\s+/).includes('__cf_email__')||/^\/cdn-cgi\/l\/email-protection/.test(node.attribs.href||''))&&encoded&&/^[a-f0-9]{6,600}$/i.test(encoded)&&encoded.length%2===0){
      try{const key=parseInt(encoded.slice(0,2),16),bytes=[];for(let i=2;i<encoded.length;i+=2)bytes.push(parseInt(encoded.slice(i,i+2),16)^key);const address=new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes)).toLowerCase();
       if(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(address)){text=address;encodedMailboxes.add(address);}
      }catch{}
    }
    const href=node.attribs?.href;
    if(node.name==='a' && href) {
      if(/^mailto:/i.test(href)) {
        let address='';
        try { address=decodeURIComponent(href.slice(7).split('?')[0]).trim().toLowerCase(); } catch {}
        // Only a single exact mailbox; do not harvest cc/bcc or fabricated patterns.
        if(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(address)) {
          mailboxes.add(address);
          if(!clean(text).toLowerCase().includes(address)) text += ` (${address})`;
        }
      } else if(sourceURL) {
        try { const u=new URL(href,sourceURL); if(u.protocol==='https:'&&!u.username&&!u.password) links.push({url:u.href.split('#')[0],label:clean(text).slice(0,120)}); } catch {}
      }
    }
    if(blocks.has(node.name)) {
      const value=clean(text);
      if(value.length>=12 && value.length<=1000) scopes.push(value);
      return ' '+text+' ';
    }
    return text;
  }
  const text=clean(visit(parseDocument(html,{decodeEntities:true})));
  const emails=[...new Set([...(text.match(emailPattern)||[]).map(x=>x.toLowerCase()),...mailboxes])];
  const contacts=emails.slice(0,100).map(email=>{
    const matching=scopes.filter(s=>s.toLowerCase().includes(email)).sort((a,b)=>a.length-b.length);
    // Return up to three actual DOM contexts for human/model identity review, not inferred names.
    const contexts=[...new Set(matching)].filter(s=>s.length>email.length+5).slice(0,3);
    if(!contexts.length){const i=text.toLowerCase().indexOf(email);if(i>=0)contexts.push(text.slice(Math.max(0,i-150),i+email.length+150));}
    return {email,publication:encodedMailboxes.has(email)?'public_cloudflare_encoding':mailboxes.has(email)?'mailto':'text',contexts,identity_verified:false};
  });
  const uniqueLinks=[...new Map(links.map(l=>[l.url,l])).values()];
  return {text,contacts,links:uniqueLinks.slice(0,200)};
}

export function companyResearchPlan(domain) {
  return {
    domain,
    research_routes:RESEARCH_ROUTES, source_catalog:SOURCE_CATALOG, source_policy:SOURCE_POLICY, research_checklist:RESEARCH_CHECKLIST,
    priority_roles:['Electrical / engineering manager','Operations / maintenance / project manager','Recruiter / HR manager','Founder or general manager for a relevant smaller business'],
    queries:[
      `site:${domain} (Saudi OR KSA OR السعودية) (partner OR integrator OR distributor OR "service center" OR "شريك")`,
      `"${domain}" (Saudi OR Dammam OR السعودية) (commissioning OR project OR "تشغيل" OR "صيانة")`,
      `site:${domain} (team OR management OR leadership OR contact) (electrical OR engineering OR operations)`,
      `site:${domain} ("@${domain}") (manager OR director OR recruitment)`,
      `site:${domain} ("فريق العمل" OR "الإدارة" OR "مدير" OR "التوظيف")`,
      `"${domain}" ("electrical manager" OR "engineering manager" OR "HR manager") Saudi`,
      `site:${domain} filetype:pdf (profile OR management OR "company profile")`,
    ],
    route:'Find the relevant person, then reopen original sources proving their role and exact published work email. A name alone or guessed mailbox is not sufficient.',
    opportunity:'All company sizes are eligible for a relevant speculative paid-junior referral inquiry. No advertised vacancy or job-board account is required. Never describe an unverified opening as available.',
    fallback:'An official recruitment inbox explicitly inviting CVs is an eligible contact tier without requiring a named-person search.',
  };
}
