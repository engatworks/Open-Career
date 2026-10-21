// Tenant-owned, bounded keyset pagination for career-data portability.
// Every query is tenant-scoped. There is deliberately no unbounded response.
const TABLES=Object.freeze({
 contacts:{table:'tenant_contacts',key:'id',numeric:false},
 applications:{table:'ats_applications',key:'id',numeric:false},
 employer_boards:{table:'tenant_boards',key:'id',numeric:false},
 observed_jobs:{table:'tenant_job_sightings',key:'job_key',numeric:false},
 events:{table:'tenant_events',key:'id',numeric:true},
});
export const EXPORT_COLLECTIONS=Object.freeze(Object.keys(TABLES));
function cursorFor(def,value){
 if(value===null||value===undefined||value==='')return def.numeric?0:'';
 if(typeof value!=='string'||value.length>310)throw Error('Invalid export cursor');
 if(def.numeric){
  if(!/^[0-9]{1,16}$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('Invalid export cursor');
  return Number(value);
 }
 if(/[\x00-\x1f]/.test(value))throw Error('Invalid export cursor');
 return value;
}
export class TenantExport {
 constructor(workspace){if(!workspace?.db?.prepare||!workspace?.id)throw Error('Authenticated tenant workspace required');this.workspace=workspace;this.db=workspace.db;this.id=workspace.id;}
 sql(query,...args){return this.db.prepare(query).bind(...args);}
 async manifest(){
  await this.workspace.account();
  const counts={};
  for(const [name,def] of Object.entries(TABLES)){
   const result=await this.sql(`SELECT COUNT(*) AS n FROM ${def.table} WHERE tenant_id=?`,this.id).first();
   counts[name]=Number(result?.n??0);
  }
  return {format:'open-career-export-v2',generated_at:new Date().toISOString(),
   account:await this.workspace.me(),profile:await this.workspace.profile(),cv:await this.workspace.cvInfo(),
   counts,collections:EXPORT_COLLECTIONS,
   snapshot_consistent:false,
   note:'Pages use keyset pagination against live data, not an atomic cross-table snapshot. Confirm final counts and retry if workspace data changed. Download PDF CV separately; sessions and secrets are intentionally excluded.'};
 }
 async page({collection,cursor=null,limit=100}={}){
  await this.workspace.account();
  if(typeof collection!=='string'||!Object.prototype.hasOwnProperty.call(TABLES,collection))throw Error('Invalid export collection');
  if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('Invalid export page limit');
  const def=TABLES[collection],after=cursorFor(def,cursor);
  const rows=(await this.sql(`SELECT * FROM ${def.table} WHERE tenant_id=? AND ${def.key}>? ORDER BY ${def.key} ASC LIMIT ?`,this.id,after,limit+1).all()).results;
  const more=rows.length>limit,items=rows.slice(0,limit);
  return {collection,items,next_cursor:more?String(items[items.length-1][def.key]):null,has_more:more,snapshot_consistent:false};
 }
}
