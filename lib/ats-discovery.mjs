// Public job discovery only. Never posts an application or handles credentials.
const PROVIDERS = Object.freeze({
  greenhouse: {host:'boards-api.greenhouse.io',prefix:'/v1/boards/',suffix:'/jobs?content=true'},
  lever: {host:'api.lever.co',prefix:'/v0/postings/',suffix:'?mode=json'},
  ashby: {host:'api.ashbyhq.com',prefix:'/posting-api/job-board/',suffix:'?includeCompensation=true'},
});
const BOARD=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
const MAX_BYTES=2_000_000;
const MAX_JOBS=100;

export function atsSource({provider,board,region='global'}) {
  if(!Object.hasOwn(PROVIDERS,provider)) throw Error('Unsupported ATS provider');
  if(typeof board!=='string'||!BOARD.test(board)) throw Error('Invalid board identifier');
  if(!['global','eu'].includes(region)) throw Error('Unsupported ATS region');
  if(region==='eu'&&provider!=='lever') throw Error('Region selection is only supported for Lever');
  const p=PROVIDERS[provider],host=provider==='lever'&&region==='eu'?'api.eu.lever.co':p.host;
  const url=`https://${host}${p.prefix}${encodeURIComponent(board)}${p.suffix}`;
  return {url,provider,board,region};
}

function publicURL(value) {
  if(typeof value!=='string'||value.length>2000) return null;
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||/^(?:localhost|\d|\[)/i.test(u.hostname)||/\.(?:local|internal|localhost)$/i.test(u.hostname))return null;
    return u.href;
  } catch {return null;}
}
const clean=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,300):'';
const jobId=value=>typeof value==='string'||typeof value==='number'?String(value).slice(0,150):'';
function toJob(provider,board,raw,source_url,checked_at){
  if(!raw||typeof raw!=='object')return null;
  const id=jobId(raw.id), title=clean(provider==='lever'?raw.text:raw.title);
  if(!id||!title)return null;
  const location=clean(provider==='greenhouse'?raw.location?.name:provider==='lever'?raw.categories?.location:raw.location);
  const apply=provider==='greenhouse'?raw.absolute_url:provider==='lever'?(raw.applyUrl||raw.hostedUrl):(raw.applyUrl||raw.jobUrl);
  const link=publicURL(apply);
  if(!link)return null;
  return {job_key:`${provider}:${board}:${id}`,provider,board,job_id:id,title,location,
    apply_url:link,source_url,source_checked_at:checked_at,eligibility:'not_evaluated',
    published_at:provider==='greenhouse'?clean(raw.updated_at):provider==='ashby'?clean(raw.publishedAt):'',
    description_preview:clean(provider==='lever'?raw.descriptionPlain:provider==='ashby'?raw.descriptionPlain:''),
    application_status:'not_applied'};
}

async function boundedJSON(url,fetcher){
  const res=await fetcher(url,{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(res.status!==200) throw Error('ATS board unavailable: HTTP '+res.status);
  const contentType=res.headers.get('content-type')?.split(';')[0].toLowerCase();
  if(contentType!=='application/json')throw Error('ATS board did not return JSON');
  if(Number(res.headers.get('content-length')||0)>MAX_BYTES)throw Error('ATS response too large');
  if(!res.body)throw Error('ATS response body missing');
  const reader=res.body.getReader();const chunks=[];let count=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>MAX_BYTES)throw Error('ATS response too large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const data=new Uint8Array(count);let pos=0;for(const c of chunks){data.set(c,pos);pos+=c.length;}
  return JSON.parse(new TextDecoder().decode(data));
}

export async function discoverATSJobs(input,{fetcher=fetch,now=()=>new Date().toISOString()}={}){
  const {url,provider,board,region}=atsSource(input||{});
  const max=Math.max(1,Math.min(MAX_JOBS,Number(input.limit)||50));
  if(!Number.isInteger(max))throw Error('Invalid results limit');
  const query=clean(input.query||'').toLowerCase();
  const data=await boundedJSON(url,fetcher);
  const entries=provider==='ashby'?data?.jobs:provider==='greenhouse'?data?.jobs:data;
  if(!Array.isArray(entries))throw Error('Unexpected ATS jobs schema');
  const checked=now(),seen=new Set(),jobs=[];
  let matches=0;
  // Inspect the entire bounded provider response so a truncated result is NEVER
  // misrepresented as complete coverage of that employer's published feed.
  for(const raw of entries){
   const j=toJob(provider,board,raw,url,checked);
   if(!j||seen.has(j.job_key)||query&&! `${j.title} ${j.location}`.toLowerCase().includes(query))continue;
   seen.add(j.job_key);matches++;
   if(jobs.length<max)jobs.push(j);
  }
  const partial_results=matches>jobs.length;
  return {provider,board,region,source_url:url,checked_at:checked,jobs,returned:jobs.length,
   matched_total:matches,feed_count:entries.length,partial_results,
   notice:partial_results?'Results are truncated by the search limit; later scans cannot guarantee full job-board coverage. No applications were submitted.':
    'Public job listings only. Employer identity, eligibility, vacancy status and application questions require independent review. No applications were submitted.'};
}
