// Authenticated, versioned per-tenant CV encryption. Server-side only.
// OCV1 is retained strictly for existing ciphertext. New writes use OCV2 when an
// independently managed keyring is configured; never infer or generate keys from user data.
const encoder=new TextEncoder(),decoder=new TextDecoder();
const KEY_ID=/^[A-Za-z0-9_-]{1,24}$/;
const B64=/^[A-Za-z0-9_-]{43}$/;
function secret(value){
 if(typeof value!=='string'||!B64.test(value))throw Error('CV encryption secret is invalid');
 const bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='),x=>x.charCodeAt(0));
 if(bytes.length!==32)throw Error('CV encryption secret must contain 32 bytes');
 return bytes;
}
function readRing(env){
 const v=env.OPENCAREER_CV_KEYRING;
 if(v===undefined||v===null||v==='')return null;
 let cfg;
 try{cfg=JSON.parse(v);}catch{throw Error('CV keyring JSON is invalid');}
 if(!cfg||Array.isArray(cfg)||typeof cfg!=='object'||Object.keys(cfg).some(k=>!['active','keys'].includes(k)))throw Error('CV keyring schema is invalid');
 if(!KEY_ID.test(cfg.active)||!cfg.keys||typeof cfg.keys!=='object'||Array.isArray(cfg.keys))throw Error('CV keyring configuration is invalid');
 const entries=Object.entries(cfg.keys);
 if(entries.length<1||entries.length>8||entries.some(([id])=>!KEY_ID.test(id)))throw Error('CV keyring identifiers are invalid');
 if(!Object.prototype.hasOwnProperty.call(cfg.keys,cfg.active))throw Error('CV keyring active key is missing');
 for(const [,value] of entries)secret(value);
 if(new Set(entries.map(([,value])=>value)).size!==entries.length)throw Error('CV keyring keys must be independent');
 if(env.OPENCAREER_CV_ENCRYPTION_KEY&&entries.some(([,value])=>value===env.OPENCAREER_CV_ENCRYPTION_KEY))throw Error('CV keyring keys must differ from the old encryption key');
 return cfg;
}
async function key(bytes){return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
function concat(...parts){const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;}
const marker=(value)=>decoder.decode(value.subarray(0,4));
function validateTenant(tenantId){if(typeof tenantId!=='string'||!/^usr_[A-Za-z0-9_-]{43}$/.test(tenantId))throw Error('Trusted tenant identity required for CV encryption');}
export function activeCVKeyId(env){return readRing(env)?.active??null;}
export function encryptedCVKeyId(payload){
 const b=new Uint8Array(payload);
 if(b.length<33)throw Error('Invalid encrypted CV envelope');
 if(marker(b)==='OCV1')return null;
 if(marker(b)!=='OCV2')throw Error('Invalid encrypted CV envelope');
 const n=b[4];if(n<1||n>24||b.length<5+n+12+16)throw Error('Invalid encrypted CV envelope');
 const id=decoder.decode(b.subarray(5,5+n));if(!KEY_ID.test(id))throw Error('Invalid encrypted CV key identifier');
 return id;
}
export async function encryptCV(bytes,env,tenantId){
 validateTenant(tenantId);
 const ring=readRing(env),iv=crypto.getRandomValues(new Uint8Array(12));
 if(!ring){
  // Explicit legacy compatibility mode; commercial deployments should configure
  // the versioned keyring before accepting new user CVs.
  const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret(env.OPENCAREER_CV_ENCRYPTION_KEY)),bytes));
  return concat(encoder.encode('OCV1'),iv,data);
 }
 const id=encoder.encode(ring.active);
 const header=concat(encoder.encode('OCV2'),new Uint8Array([id.length]),id,iv);
 // Tenant-bound associated data prohibits copying an otherwise valid ciphertext
 // from one tenant namespace into another even if those PDF bytes happen to match.
 const aad=concat(header,encoder.encode('\x00cv\x00'+tenantId));
 const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await key(secret(ring.keys[ring.active])),bytes));
 return concat(header,data);
}
export async function decryptCV(payload,env,tenantId){
 validateTenant(tenantId);
 const data=new Uint8Array(payload),id=encryptedCVKeyId(data);
 if(id===null){
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:data.subarray(4,16)},await key(secret(env.OPENCAREER_CV_ENCRYPTION_KEY)),data.subarray(16)));
 }
 const ring=readRing(env);
 if(!ring||!Object.prototype.hasOwnProperty.call(ring.keys,id))throw Error('CV decryption key version is unavailable');
 const start=5+id.length;
 const header=data.subarray(0,start+12);
 const aad=concat(header,encoder.encode('\x00cv\x00'+tenantId));
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:data.subarray(start,start+12),additionalData:aad},await key(secret(ring.keys[id])),data.subarray(start+12)));
}
