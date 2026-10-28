// Bounded independent reads: one request per origin at a time, settled results preserve failures.
export async function mapBounded(items, concurrency, operation, key = value => value) {
 const results = new Array(items.length), pending = items.map((value,index)=>({value,index})), active = new Set(), waiting=new Set();
 const wake=()=>{for(const resume of waiting)resume();waiting.clear();};
 const workers = Array.from({length:Math.min(Math.max(1,concurrency),items.length)},async()=>{
  while(pending.length){
   const at=pending.findIndex(item=>!active.has(key(item.value)));
   if(at<0){await new Promise(resolve=>waiting.add(resolve));continue;}
   const [{value,index}]=pending.splice(at,1),origin=key(value);active.add(origin);
   try{results[index]={status:'fulfilled',value:await operation(value,index)};}catch(reason){results[index]={status:'rejected',reason};}finally{active.delete(origin);wake();}
  }
 });
 await Promise.all(workers);return results;
}

export function classifyFailure(error) {
 const text=String(error?.message||error);
 if(/uncertain|ambiguous|may have completed|Gmail.*timeout/i.test(text))return {kind:'uncertain_delivery',retry:false};
 if(/forbidden|reauth|permission|authorization|disabled|opt.out|suppress/i.test(text))return {kind:'authorization_or_policy',retry:false};
 if(/429|rate.limit/i.test(text))return {kind:'rate_limit',retry:true};
 if(/timeout|network|HTTP 50[0234]|upstream/i.test(text))return {kind:'transient_read',retry:true};
 return {kind:'eligibility_or_evidence',retry:false};
}
