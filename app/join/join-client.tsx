'use client';
import {useEffect,useState} from 'react';
import styles from './join.module.css';

type Session={tenant_id:string;name:string|null;email:string|null;csrf:string;signed_in:boolean};
type Profile={name:string;headline:string;target_roles:string[];preferred_locations:string[];languages:string[];work_authorization:string;evidence:{id:string;claim:string}[];custom_fields:Record<string,string>};
type Job={job_key:string;provider:string;board:string;job_id:string;title:string;location:string;apply_url:string;source_checked_at:string};
type Saved={id:string;job_key:string;title:string;status:string;apply_url:string;created_at:string};
type WatchedBoard={id:string;provider:string;board:string;region:string;label:string;last_success_at:string|null;last_error:string|null;new_count:number;auto_scan:number};
type ObservedJob={job_key:string;title:string;location:string;apply_url:string;first_seen_at:string;status:string};
const blank:Profile={name:'',headline:'',target_roles:[],preferred_locations:[],languages:[],work_authorization:'',evidence:[],custom_fields:{}};
const nav=['Overview','Profile','My CV','Jobs','Contacts','Privacy'] as const;
type Tab=typeof nav[number];
const joined=(arr:string[])=>arr.join(', ');
const split=(value:string)=>value.split(',').map(x=>x.trim()).filter(Boolean);
function Icon({name}:{name:string}){const paths:Record<string,string>={spark:'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2z',arrow:'M5 12h14m-7-7 7 7-7 7',shield:'M12 2 4 5v7c0 5 3 8 8 10 5-2 8-5 8-10V5l-8-3zm-4 10 3 3 5-5',briefcase:'M4 7h16v13H4V7zm5 0V4h6v3',check:'m5 12 4 4L19 6'};return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.spark}/></svg>}
export default function JoinClient(){
 const [configured,setConfigured]=useState<boolean|null>(null);
 const [session,setSession]=useState<Session|null>(null);
 const [checking,setChecking]=useState(true);
 const [tab,setTab]=useState<Tab>('Overview');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [profile,setProfile]=useState<Profile>(blank);
 const [cv,setCv]=useState<{sha256:string;byte_length:number}|null>(null);
 const [saved,setSaved]=useState<Saved[]>([]);
 const [boards,setBoards]=useState<WatchedBoard[]>([]);
 const [newJobs,setNewJobs]=useState<ObservedJob[]>([]);
 const [boardLabel,setBoardLabel]=useState('');
 const [contacts,setContacts]=useState<{id:string;name:string;email:string;company:string;status:string}[]>([]);
 const [contact,setContact]=useState({email:'',name:'',company:'',role:'',source_url:''});
 const [provider,setProvider]=useState('greenhouse');
 const [board,setBoard]=useState('');
 const [query,setQuery]=useState('');
 const [jobs,setJobs]=useState<Job[]>([]);
 const [confirmDelete,setConfirmDelete]=useState('');
 const [evidence,setEvidence]=useState('');
 const [roles,setRoles]=useState('');
 const [locations,setLocations]=useState('');
 const [languages,setLanguages]=useState('');
 const [discoveryAt,setDiscoveryAt]=useState('');
 async function api(path:string,init:RequestInit={},s=session){
  const method=(init.method||'GET').toUpperCase();
  const headers=new Headers(init.headers||{});
  if(!['GET','HEAD'].includes(method)){
   if(!s?.csrf)throw Error('Your session has expired. Sign in again.');
   headers.set('X-OC-CSRF',s.csrf);
  }
  if(typeof init.body==='string')headers.set('Content-Type','application/json');
  const response=await fetch(path,{...init,method,headers,credentials:'same-origin',cache:'no-store'});
  const data:any=await response.json();
  if(!response.ok)throw Error(data.error||'Request unsuccessful');
  return data;
 }
 async function refresh(s:Session){
  const [p,c,a,co,wb,oj]=await Promise.all([api('/api/v2/profile',{},s),api('/api/v2/cv/info',{},s),api('/api/v2/applications',{},s),api('/api/v2/contacts',{},s),api('/api/v2/boards',{},s),api('/api/v2/listings?status=new',{},s)]);
  if(p.profile){
   setProfile({...blank,...p.profile});
   setEvidence((p.profile.evidence||[]).map((e:{claim:string})=>e.claim).join('\n'));
   setRoles(joined(p.profile.target_roles||[]));setLocations(joined(p.profile.preferred_locations||[]));setLanguages(joined(p.profile.languages||[]));
  }
  setCv(c.cv);setSaved(a.items||[]);setContacts(co.items||[]);setBoards(wb.items||[]);setNewJobs(oj.items||[]);
 }
 useEffect(()=>{
  let active=true;
  (async()=>{
   try{
    const availability:any=await fetch('/auth/status',{cache:'no-store'}).then(r=>r.json());
    if(!active)return;setConfigured(availability.configured===true);
    if(availability.configured){
     const res=await fetch('/auth/session',{cache:'no-store'});
     if(res.ok){const s=await res.json() as Session;if(active){setSession(s);await refresh(s);}}
    }
   }catch(error){if(active)setMessage(error instanceof Error?error.message:'Unable to load workspace');}
   finally{if(active)setChecking(false);}
  })();
  return()=>{active=false;};
 // Boot only once; subsequent requests use the refreshed session object.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function action(fn:()=>Promise<void>){
  setBusy(true);setMessage('');
  try{await fn();}catch(error){setMessage(error instanceof Error?error.message:'Action failed');}
  finally{setBusy(false);}
 }
 async function saveProfile(){await action(async()=>{
  if(!session)return;
  const info:Profile={...profile,name:profile.name.trim(),headline:profile.headline.trim(),target_roles:split(roles),preferred_locations:split(locations),languages:split(languages),evidence:evidence.split('\n').map((claim,i)=>({id:'fact-'+(i+1),claim:claim.trim()})).filter(x=>x.claim),custom_fields:profile.custom_fields||{}};
  await api('/api/v2/profile',{method:'POST',body:JSON.stringify(info)});setProfile(info);setMessage('Your candidate profile was saved to your private workspace.');
 });}
 async function upload(file:File|undefined){if(!file)return;await action(async()=>{
  if(file.size>5_000_000||(file.type&&file.type!=='application/pdf'))throw Error('Choose a PDF smaller than 5 MB.');
  const bytes=await file.arrayBuffer();
  await api('/api/v2/cv',{method:'POST',body:bytes,headers:{'Content-Type':'application/pdf'}});
  const next=await api('/api/v2/cv/info');setCv(next.cv);setMessage('CV uploaded and encrypted in your workspace.');
 });}
 async function searchJobs(){await action(async()=>{
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(board))throw Error('Enter a valid employer board slug.');
  const url='/api/v2/ats/jobs?'+new URLSearchParams({provider,board,q:query,limit:'50'});
  const result=await api(url);setJobs(result.jobs||[]);setDiscoveryAt(result.checked_at);
  if(!result.jobs?.length)setMessage('No matching jobs were returned from this public board.');
 });}
 async function saveBoard(){await action(async()=>{
  const result=await api('/api/v2/boards',{method:'POST',body:JSON.stringify({provider,board,region:'global',label:boardLabel})});
  setBoards((await api('/api/v2/boards')).items);setMessage(result.created?'Employer board added. Verify its official association before relying on its listings.':'This employer board is already saved.');
 });}
 async function scanBoard(id:string){await action(async()=>{
  const result=await api('/api/v2/boards/scan',{method:'POST',body:JSON.stringify({id})});
  const [wb,oj]=await Promise.all([api('/api/v2/boards'),api('/api/v2/listings?status=new')]);
  setBoards(wb.items);setNewJobs(oj.items);
  setMessage(result.baseline?'Baseline saved: '+result.found+' public listings. Future scans will highlight new ones.':result.newly_detected+' newly detected listings out of '+result.found+' checked.');
 });}
 async function toggleAutoScan(b:WatchedBoard){await action(async()=>{
  await api('/api/v2/boards/auto',{method:'POST',body:JSON.stringify({id:b.id,enabled:!b.auto_scan})});
  setBoards((await api('/api/v2/boards')).items);
  setMessage(b.auto_scan?'Background checks disabled for this board.':'Background checks opted in. They will run only after the trusted cloud scheduler is configured.');
 });}
 async function seeJob(jobKey:string){await action(async()=>{
  await api('/api/v2/boards/seen',{method:'POST',body:JSON.stringify({job_key:jobKey})});
  const [wb,oj]=await Promise.all([api('/api/v2/boards'),api('/api/v2/listings?status=new')]);setBoards(wb.items);setNewJobs(oj.items);
 });}
 async function saveJob(job:Job){await action(async()=>{
  if(!session)return;
  await api('/api/v2/applications/track',{method:'POST',body:JSON.stringify({job})});
  setSaved((await api('/api/v2/applications')).items);
  setMessage('Job saved. No application was submitted.');
 });}
 async function addContact(){await action(async()=>{
  await api('/api/v2/contacts',{method:'POST',body:JSON.stringify(contact)});
  setContacts((await api('/api/v2/contacts')).items);setContact({email:'',name:'',company:'',role:'',source_url:''});
  setMessage('Contact saved as unverified. No message was sent.');
 });}

 if(checking)return <main className={styles.screen}><div className={styles.wait}>Preparing your private workspace…</div></main>;
 if(!session)return <main className={styles.screen}>
  <div className={styles.glowOne}/><div className={styles.glowTwo}/>
  <header className={styles.top}><a className={styles.wordmark} href="/"><span className={styles.mark}><Icon name="spark"/></span> OPEN CAREER</a><span className={styles.topRight}>THE NEXT CHAPTER STARTS HERE <span className={styles.dot}/></span></header>
  <section className={styles.hero}><div className={styles.eyebrow}><span className={styles.pulse}/> PRIVATE CAREER INTELLIGENCE</div>
   <h1>Find your place.<br/><em>Make your move.</em></h1>
   <p>One thoughtful workspace for the entire job search. Your experience, your opportunities, your applications — organized and under your control.</p>
   <div className={styles.heroActions}>
    {configured?<a className={styles.primary} href="/auth/start">Sign in or create your account <Icon name="arrow"/></a>:<span className={styles.offline}>Registration is not open yet. Identity-provider configuration is pending.</span>}
    <span className={styles.smallNote}>Your CV is private. Your application decisions stay yours.</span>
   </div>
   {message&&<div role="status" className={styles.notice}>{message}</div>}
  </section>
  <div className={styles.features}><article><Icon name="briefcase"/><h3>Discover what fits</h3><p>Explore real, published openings and save the opportunities worth pursuing.</p></article><article><Icon name="shield"/><h3>A private foundation</h3><p>Your profile and documents belong to your account — not anyone else's.</p></article><article><Icon name="check"/><h3>Stay in control</h3><p>Prepare applications deliberately. Nothing gets submitted behind your back.</p></article></div>
  <footer className={styles.footer}>OPEN CAREER · EARLY ACCESS DEVELOPMENT <span>Built for every beginning.</span></footer>
 </main>;

 return <main className={styles.dashboard}>
  <aside className={styles.sidebar}><a href="/" className={styles.wordmark}><span className={styles.mark}><Icon name="spark"/></span> OPEN CAREER</a>
   <div className={styles.navTitle}>YOUR WORKSPACE</div>
   <nav aria-label="Workspace sections">{nav.map(item=><button key={item} className={tab===item?styles.navActive:styles.navItem} onClick={()=>{setTab(item);setMessage('');}} aria-current={tab===item?'page':undefined}>{item}</button>)}</nav>
   <div className={styles.sidebarFoot}><span className={styles.avatar}>{(session.name||session.email||'?').slice(0,1).toUpperCase()}</span><div><strong>{session.name||'Your account'}</strong><small>{session.email||'Signed in securely'}</small></div></div>
  </aside>
  <div className={styles.mainArea}><header className={styles.dashHeader}><div><div className={styles.eyebrow}>YOUR OPEN CAREER SPACE</div><h1>{tab==='Overview'?'Welcome back.':tab}</h1></div><span className={styles.private}><Icon name="shield"/> PRIVATE WORKSPACE</span></header>
   {message&&<div className={styles.notice} role="status">{message}</div>}
   {tab==='Overview'&&<div className={styles.overview}><div className={styles.intro}><span className={styles.eyebrow}>EVERY CAREER HAS A BEGINNING</span><h2>Build momentum,<br/><em>one opportunity at a time.</em></h2><p>Create a trustworthy profile, keep your CV current and discover roles directly from supported employer boards.</p><button className={styles.primary} onClick={()=>setTab('Profile')}>Review your profile <Icon name="arrow"/></button></div><div className={styles.metricGrid}><article><span>MY PROFILE</span><strong>{profile.name?'Started':'Not started'}</strong><button onClick={()=>setTab('Profile')}>View details →</button></article><article><span>CV FILE</span><strong>{cv?'Encrypted':'Not uploaded'}</strong><button onClick={()=>setTab('My CV')}>Manage CV →</button></article><article><span>SAVED OPPORTUNITIES</span><strong>{saved.length}</strong><button onClick={()=>setTab('Jobs')}>Discover jobs →</button></article></div></div>}
   {tab==='Profile'&&<section className={styles.panel}><h2>Tell us about your work</h2><p>Only include facts you can substantiate. Open Career will use this information to evaluate fit and prepare accurate drafts.</p><div className={styles.formGrid}><label>Full name<input value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})} maxLength={120} placeholder="Your full name"/></label><label>Professional headline<input value={profile.headline} onChange={e=>setProfile({...profile,headline:e.target.value})} maxLength={240} placeholder="Early-career electrical engineer"/></label><label>Target roles (comma-separated)<input value={roles} onChange={e=>setRoles(e.target.value)} placeholder="Graduate Engineer, Electrical Designer"/></label><label>Preferred locations (comma-separated)<input value={locations} onChange={e=>setLocations(e.target.value)} placeholder="Riyadh, Dublin, Remote"/></label><label>Languages (comma-separated)<input value={languages} onChange={e=>setLanguages(e.target.value)} placeholder="English, Arabic"/></label><label>Work authorization notes<input value={profile.work_authorization} onChange={e=>setProfile({...profile,work_authorization:e.target.value})} placeholder="Be precise about your eligibility"/></label><label className={styles.wide}>Verified experience and achievements — one claim per line<textarea rows={7} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Graduated with a degree in…&#10;Assisted with…"/></label></div><button className={styles.primary} disabled={busy||!profile.name.trim()} onClick={saveProfile}>{busy?'Saving…':'Save candidate profile'} <Icon name="arrow"/></button></section>}
   {tab==='My CV'&&<section className={styles.panel}><h2>One secure home for your CV</h2><p>PDFs are encrypted before private storage and only your authenticated account can retrieve them.</p><div className={styles.upload}><Icon name="shield"/><strong>{cv?'A verified CV is stored':'Upload your PDF CV'}</strong><span>{cv?Math.ceil(cv.byte_length/1024)+' KB · SHA-256: '+cv.sha256.slice(0,16)+'…':'Maximum 5 MB · PDF only'}</span><label className={styles.secondary}>Select PDF<input aria-label="Upload PDF CV" type="file" accept="application/pdf" className={styles.file} disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.currentTarget.value='';}}/></label>{cv&&<a href="/api/v2/cv" className={styles.textLink}>Download your stored CV ↗</a>}</div></section>}
   {tab==='Jobs'&&<section className={styles.panel}><h2>Find a better fit</h2><p>Search the official public job boards used by Greenhouse, Lever and Ashby. The employer's board identifier is required; results are not independently verified vacancies or eligibility decisions.</p><div className={styles.searchGrid}><label>Recruitment platform<select value={provider} onChange={e=>setProvider(e.target.value)}><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option><option value="ashby">Ashby</option></select></label><label>Employer board slug<input value={board} onChange={e=>setBoard(e.target.value)} placeholder="example-company"/></label><label>Filter by role or location<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Engineer, Dublin…"/></label><button className={styles.primary} disabled={busy} onClick={searchJobs}>Find openings <Icon name="arrow"/></button></div>{discoveryAt&&<p className={styles.tiny}>Public listing check: {new Date(discoveryAt).toLocaleString()}</p>}
    <div className={styles.watchBlock}><h3>My employer watchlist <span className={styles.count}>{boards.length}/25</span></h3><p>Save the employer's official ATS board once, then rescan it. The first scan establishes a baseline; later scans identify newly published job listings.</p>
      <div className={styles.watchRegister}><label>Employer display name<input value={boardLabel} maxLength={160} onChange={e=>setBoardLabel(e.target.value)} placeholder="Company name"/></label><button className={styles.secondary} disabled={busy||!boardLabel.trim()||!board.trim()} onClick={saveBoard}>Watch current board</button></div>
      <div className={styles.resultList}>{boards.map(b=><article className={styles.result} key={b.id}><div><strong>{b.label}</strong><span>{b.provider} / {b.board} · {b.new_count} new · {b.last_success_at?'Last scan: '+new Date(b.last_success_at).toLocaleDateString():'Needs first scan'}</span>{b.last_error&&<span>Last check issue: {b.last_error}</span>}</div><div className={styles.resultActions}><button className={styles.secondary} onClick={()=>scanBoard(b.id)} disabled={busy}>Scan now</button><button className={styles.secondary} disabled={busy} onClick={()=>toggleAutoScan(b)}>{b.auto_scan?'Turn off auto-scan':'Opt in to auto-scan'}</button></div></article>)}</div>
      <h3>Newly detected jobs <span className={styles.count}>{newJobs.length}</span></h3>
      <div className={styles.resultList}>{newJobs.map(j=><article key={j.job_key} className={styles.result}><div><strong>{j.title}</strong><span>{j.location||'Location not listed'} · observed {new Date(j.first_seen_at).toLocaleDateString()}</span></div><div className={styles.resultActions}><a href={j.apply_url} rel="noopener noreferrer" target="_blank">Official listing ↗</a><button disabled={busy} onClick={()=>seeJob(j.job_key)}>Mark seen</button></div></article>)}</div>
    </div>
    <div className={styles.resultList}>{jobs.map(j=><article className={styles.result} key={j.job_key}><div><strong>{j.title}</strong><span>{j.location||'Location not listed'} · {j.provider}</span></div><div className={styles.resultActions}><a href={j.apply_url} target="_blank" rel="noopener noreferrer">Official listing ↗</a><button disabled={busy||saved.some(s=>s.job_key===j.job_key)} onClick={()=>saveJob(j)}>{saved.some(s=>s.job_key===j.job_key)?'Saved':'Save role'}</button></div></article>)}</div>
    <h3>Saved opportunities <span className={styles.count}>{saved.length}</span></h3><div className={styles.resultList}>{saved.map(s=><article className={styles.result} key={s.id}><div><strong>{s.title}</strong><span>{s.status.replaceAll('_',' ')} · Not auto-submitted</span></div><a href={s.apply_url} target="_blank" rel="noopener noreferrer">View listing ↗</a></article>)}</div>{!saved.length&&<div className={styles.empty}>Your saved opportunities will appear here.</div>}</section>}
   {tab==='Contacts'&&<section className={styles.panel}><h2>People and professional connections</h2><p>Save relevant published business contacts for research. A saved address is not permission to email someone or proof their employment is current.</p><div className={styles.formGrid}><label>Professional email<input value={contact.email} onChange={e=>setContact({...contact,email:e.target.value})} type="email" placeholder="contact@company.com"/></label><label>Name<input value={contact.name} onChange={e=>setContact({...contact,name:e.target.value})}/></label><label>Company<input value={contact.company} onChange={e=>setContact({...contact,company:e.target.value})}/></label><label>Role<input value={contact.role} onChange={e=>setContact({...contact,role:e.target.value})}/></label><label className={styles.wide}>Public source URL<input value={contact.source_url} onChange={e=>setContact({...contact,source_url:e.target.value})} placeholder="https://company.com/team"/></label></div><button className={styles.primary} disabled={busy||!contact.email} onClick={addContact}>Add contact <Icon name="arrow"/></button><div className={styles.resultList}>{contacts.map(c=><article key={c.id} className={styles.result}><div><strong>{c.name||c.email}</strong><span>{c.company||'Company unverified'} · {c.status}</span></div><span>{c.email}</span></article>)}</div></section>}
   {tab==='Privacy'&&<section className={styles.panel}><h2>It's your information.</h2><p>Download an export of your workspace history, retrieve your CV separately, or revoke this browser session. Deleting your account permanently removes your workspace records and associated stored CV.</p><div className={styles.privacyActions}><a className={styles.secondary} href="/api/v2/export">Export your workspace JSON ↗</a>{cv&&<a className={styles.secondary} href="/api/v2/cv">Download your CV ↗</a>}<button className={styles.secondary} disabled={busy} onClick={()=>action(async()=>{await api('/auth/logout',{method:'POST'});window.location.assign('/join');})}>Sign out of this browser</button></div><div className={styles.danger}><h3>Delete account</h3><p>This action cannot be undone. Type <strong>DELETE MY ACCOUNT</strong> to confirm.</p><input aria-label="Account deletion confirmation" value={confirmDelete} onChange={e=>setConfirmDelete(e.target.value)} placeholder="DELETE MY ACCOUNT"/><button disabled={busy||confirmDelete!=='DELETE MY ACCOUNT'} onClick={()=>action(async()=>{await api('/api/v2/account',{method:'DELETE',body:JSON.stringify({confirm:confirmDelete})});window.location.assign('/join');})}>Permanently delete my account</button></div></section>}
   <footer className={styles.dashFooter}>OPEN CAREER · EARLY ACCESS <span>Prepared by you. Controlled by you.</span></footer>
  </div>
 </main>;
}
