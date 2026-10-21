import {env} from 'cloudflare:workers';
import {redirect} from 'next/navigation';
import {accessMode,multiuserAllowed} from '@/lib/release-security.mjs';
import {markup} from '@/lib/ui-assets';
export const dynamic='force-dynamic';
export default function Home(){
 if(multiuserAllowed(env))redirect('/join');
 if(accessMode(env)!=='owner_private')return <main style={{fontFamily:'system-ui',padding:'4rem',maxWidth:640,margin:'auto'}}><h1>Open Career is not available</h1><p>This deployment is not configured for public access.</p></main>;
 return <><link rel="stylesheet" href="/assets/style.css"/><div dangerouslySetInnerHTML={{__html:markup}}/><script src="/assets/app.js" defer/></>;
}
