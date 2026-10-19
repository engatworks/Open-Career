// Restrict the original single-owner D1/R2 workspace to its configured ChatGPT identity.
// Provision configuration.owner_chatgpt_user_id privately through a trusted deployment admin.
// NEVER auto-claim the database for the first visitor or set the ID from an agent-facing tool.
export async function assertPrivateOwner(db,userId){
 if(!db?.prepare||typeof userId!=='string'||!userId.trim())throw Error('Authenticated private owner required');
 const record=await db.prepare("SELECT value FROM configuration WHERE key='owner_chatgpt_user_id'").first();
 let expected;
 try { expected=JSON.parse(record?.value??'null'); }catch { expected=null; }
 if(typeof expected!=='string'||!expected.trim())throw Error('Private owner identity is not provisioned: stop before reading or writing personal data');
 if(userId!==expected)throw Error('Access denied: this private workspace belongs to a different account');
 return true;
}
