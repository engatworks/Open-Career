'use client';
import { useMemo, useState } from 'react';
import { assessOpportunity, OPPORTUNITY_TEXT_LIMIT } from '@/lib/opportunity-fit.mjs';
import { ArrowUpRight, Check, ClipboardCopy, Compass, ExternalLink, Globe2, LockKeyhole, RotateCcw, ScanSearch, ShieldCheck, Sparkles } from 'lucide-react';

const sampleA='Graduate Electrical Engineer — International Opportunities\nWe are hiring recent graduates for engineering support, electrical schematics and project documentation.\nVisa sponsorship is available for suitable international candidates.\nThe role requires practical Excel skills and excellent communication.';
const sampleB='Electrical Design Engineer\nCandidates must already be authorized to work in the United States without visa sponsorship.\nMinimum of 5 years of relevant experience is required.\nRemote role only within the United States.';
const labels:Record<string,string>={
  'likely-ineligible':'Potential mismatch',
  'needs-review':'Needs human review',
  'no-obvious-conflict':'No obvious conflict',
  'positive':'Encouraging signal',
  'review':'Verify this',
  'blocker':'Potential blocker',
  'info':'Noted'
};
type Signal={kind:string;severity:string;detail:string;quote:string};
type Review={verdict:string;sponsorship:string;signals:Signal[];summary:string;disclaimer:string};
export default function OpportunityLab(){
  const [text,setText]=useState('');
  const [sponsorship,setSponsorship]=useState('yes');
  const [authorization,setAuthorization]=useState('unknown');
  const [experience,setExperience]=useState('');
  const [country,setCountry]=useState('');
  const [result,setResult]=useState<Review|null>(null);
  const [error,setError]=useState('');
  const [copied,setCopied]=useState(false);
  const configured=useMemo(()=>text.trim().length>=35,[text]);
  const analyze=()=>{
    try{
      const review=assessOpportunity({text,needsSponsorship:sponsorship==='yes',authorizedToWork:authorization==='unknown'?null:authorization==='yes',yearsExperience:experience.trim()===''?null:Number(experience),currentCountry:country});
      setResult(review);setError('');setCopied(false);
      requestAnimationFrame(()=>document.getElementById('lab-results')?.scrollIntoView({behavior:'smooth',block:'start'}));
    }catch(e){setResult(null);setError(e instanceof Error?e.message:'Unable to review the text.');}
  };
  const setSample=(value:string)=>{setText(value);setResult(null);setError('');};
  const copy=async()=>{
    if(!result)return;
    const report=['OPEN CAREER — OPPORTUNITY REVIEW',labels[result.verdict],result.summary,'',...result.signals.map(s=>[labels[s.severity]+': '+s.detail,s.quote?'Evidence: '+s.quote:''].filter(Boolean).join('\n')),'',result.disclaimer].join('\n\n');
    try{await navigator.clipboard.writeText(report);setCopied(true);}catch{setError('Copy was blocked by your browser. Select and copy the review manually.');}
  };
  return <div className="oc-lab">
    <a className="oc-skip" href="#oc-workbench">Skip to job review</a>
    <header className="oc-header">
      <a href="/" className="oc-brand"><span className="oc-brand-mark">O<span>.</span></span><span>OPEN CAREER</span></a>
      <nav aria-label="Opportunity Lab navigation"><span className="oc-current">Opportunity Lab</span><a href="https://github.com/engatworks/Open-Career" target="_blank" rel="noreferrer">View source <ArrowUpRight size={15}/></a></nav>
    </header>
    <main>
      <section className="oc-hero" aria-labelledby="oc-title">
        <div className="oc-eyebrow"><span className="oc-live-dot"/> Introducing Opportunity Intelligence · Preview 01</div>
        <h1 id="oc-title">Stop guessing.<br/><em>Start qualifying.</em></h1>
        <p>Not every job is available to everyone. Find the sponsorship, experience and location requirements hiding inside a job posting—before you spend an hour applying.</p>
        <div className="oc-hero-meta"><span><ShieldCheck size={16}/> Evidence you can inspect</span><span><Globe2 size={16}/> Built for global candidates</span><span><LockKeyhole size={16}/> No data sent or stored</span></div>
      </section>
      <section className="oc-workspace" id="oc-workbench" aria-label="Opportunity reviewer">
        <div className="oc-workspace-heading"><div><span className="oc-overline">01 / THE WORKBENCH</span><h2>Review an opportunity</h2><p>Paste a public job description. This initial review runs locally in your browser, without account creation or AI-generated guesses.</p></div><span className="oc-beta">BETA TOOL</span></div>
        <div className="oc-cols">
          <section className="oc-panel oc-entry" aria-labelledby="oc-job-title">
            <div className="oc-panel-heading"><span className="oc-panel-icon"><ScanSearch size={19}/></span><div><h3 id="oc-job-title">The job posting</h3><p>Use the actual requirements, not a search snippet.</p></div></div>
            <label className="oc-label" htmlFor="oc-job-text">Description and requirements</label>
            <textarea id="oc-job-text" spellCheck={false} value={text} maxLength={OPPORTUNITY_TEXT_LIMIT} onChange={e=>{setText(e.target.value);setResult(null);setError('');}} placeholder="Paste the vacancy description here, including the requirements and any sponsorship policy…" aria-describedby="oc-job-help" rows={13}/>
            <div className="oc-textarea-foot"><span id="oc-job-help">No scraping. No automatic applications. No invented employer policies.</span><span>{text.length.toLocaleString()} / {OPPORTUNITY_TEXT_LIMIT.toLocaleString()}</span></div>
            <div className="oc-sample"><span>TRY AN EXAMPLE</span><button type="button" onClick={()=>setSample(sampleA)}>International graduate role <ArrowUpRight size={13}/></button><button type="button" onClick={()=>setSample(sampleB)}>Restricted US role <ArrowUpRight size={13}/></button></div>
          </section>
          <section className="oc-panel oc-profile" aria-labelledby="oc-profile-title">
            <div className="oc-panel-heading"><span className="oc-panel-icon"><Compass size={19}/></span><div><h3 id="oc-profile-title">Your circumstances</h3><p>Only the details relevant to these checks.</p></div></div>
            <fieldset><legend className="oc-label">Do you need employer sponsorship?</legend><div className="oc-choice-group"><button type="button" aria-pressed={sponsorship==='yes'} onClick={()=>{setSponsorship('yes');setResult(null);}}>Yes</button><button type="button" aria-pressed={sponsorship==='no'} onClick={()=>{setSponsorship('no');setResult(null);}}>No</button></div></fieldset>
            <label className="oc-label" htmlFor="oc-auth">Are you already authorized to work in the job's country?</label>
            <select id="oc-auth" value={authorization} onChange={e=>{setAuthorization(e.target.value);setResult(null);}}><option value="unknown">Not sure / depends on country</option><option value="no">No</option><option value="yes">Yes</option></select>
            <label className="oc-label" htmlFor="oc-years">Relevant experience (years)</label>
            <input id="oc-years" type="number" inputMode="decimal" min="0" max="70" step="0.5" value={experience} onChange={e=>{setExperience(e.target.value);setResult(null);}} placeholder="Leave blank if unsure"/>
            <label className="oc-label" htmlFor="oc-country">Current country (optional)</label>
            <select id="oc-country" value={country} onChange={e=>{setCountry(e.target.value);setResult(null);}}>
              <option value="">Prefer not to say / elsewhere</option>
              {['Saudi Arabia','United States','United Kingdom','Canada','Germany','Netherlands','Australia','India','Egypt','Turkey'].map(x=><option key={x} value={x}>{x}</option>)}
            </select>
            <p className="oc-privacy"><LockKeyhole size={16}/> This tool doesn't upload, save or transmit the description or these answers.</p>
            <button className="oc-analyze" type="button" disabled={!configured} onClick={analyze}>Review this opportunity <ArrowUpRight size={20}/></button>
            {error&&<p className="oc-error" role="alert">{error}</p>}
          </section>
        </div>
      </section>
      <section id="lab-results" className="oc-results" aria-label="Review results" aria-live="polite">
        {result?<><div className="oc-results-head"><div><span className="oc-overline">02 / EVIDENCE REVIEW</span><h2>Here's what the posting actually says.</h2></div><div className="oc-actions"><button type="button" onClick={copy}>{copied?<Check size={17}/>:<ClipboardCopy size={17}/>} {copied?'Copied':'Copy review'}</button><button type="button" onClick={()=>{setResult(null);setText('');}}><RotateCcw size={17}/> Reset</button></div></div>
          <div className={'oc-verdict oc-verdict-'+result.verdict}><span className="oc-verdict-dot"/><div><span>{labels[result.verdict]}</span><h3>{result.summary}</h3></div></div>
          <div className="oc-signals">{result.signals.length?result.signals.map((signal,i)=><article key={i} className="oc-signal"><div className="oc-signal-label"><span className={'oc-pill oc-pill-'+signal.severity}>{labels[signal.severity]}</span><span>{signal.kind.replaceAll('-',' ')}</span></div><h4>{signal.detail}</h4>{signal.quote?<blockquote>{signal.quote}</blockquote>:<p className="oc-no-quote">No clear statement found in the pasted text.</p>}</article>):<article className="oc-signal"><span className="oc-pill">No explicit rules found</span><h4>No specific restrictions matched this preliminary checker.</h4><p>Absence of a finding does not prove eligibility.</p></article>}</div>
          <p className="oc-disclaimer"><ShieldCheck size={17}/>{result.disclaimer}</p>
        </>:<div className="oc-empty"><span className="oc-empty-icon"><Sparkles size={27}/></span><span className="oc-overline">02 / THE RESULTS</span><h2>Clarity comes next.</h2><p>Complete the workbench above to see a careful breakdown of potential blockers, encouraging signals and questions worth asking the employer.</p></div>}
      </section>
      <section className="oc-beyond"><span className="oc-overline">WHAT WE'RE BUILDING TOWARD</span><h2>More than another application tracker.</h2><p>Open Career's direction is a transparent, global career workspace: verifiable jobs, meaningful contacts, sponsorship-aware research and a clear record of every action.</p><div className="oc-feature-strip"><span>01. Opportunity intelligence</span><span>02. Evidence-backed discovery</span><span>03. Human-approved outreach</span><span>04. An honest career pipeline</span></div></section>
    </main>
    <footer className="oc-footer"><span>© Open Career · Built for the long game</span><span>Prototype · No account data connected</span><a href="https://github.com/engatworks/Open-Career" target="_blank" rel="noreferrer">Open source <ExternalLink size={14}/></a></footer>
  </div>;
}
