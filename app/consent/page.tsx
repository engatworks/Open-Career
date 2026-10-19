'use client';
import { useEffect, useState } from 'react';
const labels:Record<string,string>={
 'research:read':'Read my candidate history and research records',
 'applications:prepare':'Prepare new applications and reserve unique vacancies',
 'applications:submit':'Authorize submitted browser applications where my AI host allows',
 'accounts:create':'Create and track accounts on employer websites where permitted',
 'accounts:credentials_store':'Allow future password-vault integration (NOT yet operational)',
 'email:read':'Read relevant recruitment emails through connected Gmail',
 'email:send':'Send researched job applications and recruitment inquiries',
 'email:reply':'Reply within relevant recruiter threads',
 'records:write':'Update my application statuses and evidence',
 'followups:send':'Send relevant employer follow-ups within limits',
};
type Data={accepted:boolean,termsVersion:string,termsText:string,scopes:string[],availableScopes:string[],error?:string,acceptedAt?:string};
export default function ConsentPage(){
 const [data,setData]=useState<Data|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [agree,setAgree]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{fetch('/api/mvp/consent',{credentials:'same-origin'}).then(r=>r.json()).then((r:Data)=>{if(r.error)throw Error(r.error);setData(r);setSelected(r.scopes)}).catch(e=>setError(String(e.message||e)))},[]);
 async function submit(action:'accept'|'revoke',scope?:string){
  setBusy(true);setError('');
  try{
   const res=await fetch('/api/mvp/consent',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='accept'?{action,agree,selectedScopes:selected}:{action,scope})});
   const next=await res.json() as Data;
   if(!res.ok)throw Error(next.error||'Update failed');
   setData(next);setSelected(next.scopes);setAgree(false);
  }catch(e){setError(e instanceof Error?e.message:'Update failed');}finally{setBusy(false);}
 }
 const section={maxWidth:740,margin:'40px auto',padding:'0 22px',fontFamily:'system-ui, sans-serif',lineHeight:1.55} as const;
 return <main style={section}>
  <a href="/" style={{color:'#536fb0'}}>← Open Career</a>
  <h1>Job-search automation permissions</h1>
  <p><strong>Owner-first MVP:</strong> choose which actions Open Career may perform on your behalf. Connected AI/browser providers can still require separate approval.</p>
  {!data&&<p>{error||'Loading private consent settings…'}</p>}
  {data&&<>
   <p><strong>Status:</strong> {data.accepted?'Accepted':'Not accepted'} · Terms version {data.termsVersion}</p>
   <details open><summary><strong>Terms and risks — read before continuing</strong></summary>
    <p style={{whiteSpace:'pre-wrap'}}>{data.termsText}</p>
    <p>Read the <a href="https://github.com/engatworks/Open-Career/blob/feat/mvp-plugin-authorization-foundation/docs/MVP_TERMS_DRAFT.md" target="_blank" rel="noopener noreferrer">full draft Terms</a> and <a href="https://github.com/engatworks/Open-Career/blob/feat/mvp-plugin-authorization-foundation/docs/MVP_PRIVACY_NOTICE_DRAFT.md" target="_blank" rel="noopener noreferrer">draft Privacy Notice</a>. Both require qualified legal review before public release. No employment outcome is guaranteed.</p>
   </details>
   <h2>Choose permissions</h2>
   {data.availableScopes.map(scope=><label key={scope} style={{display:'block',padding:'10px 0',borderBottom:'1px solid #9995'}}>
    <input type="checkbox" checked={selected.includes(scope)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,scope]:prev.filter(x=>x!==scope))}/>
    {' '}{labels[scope]||scope}
   </label>)}
   <p><label><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}/> I have read the disclosure and explicitly authorize only the permissions I selected.</label></p>
   <button type="button" disabled={!agree||!selected.length||busy} onClick={()=>submit('accept')} style={{padding:'12px 22px',cursor:'pointer'}}>Accept and save selected permissions</button>
   {data.accepted&&<button type="button" disabled={busy} onClick={()=>submit('revoke','all')} style={{padding:'12px 22px',marginLeft:12}}>Revoke all permissions</button>}
   <p style={{color:'crimson'}} role="alert">{error}</p>
   <p><a href="/applications">View application history →</a></p>
  </>}
 </main>;
}
