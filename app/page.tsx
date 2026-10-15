import { markup } from '@/lib/ui-assets';
export const dynamic='force-dynamic';
export default function Home(){return <><link rel="stylesheet" href="/assets/style.css"/><div dangerouslySetInnerHTML={{__html:markup}}/><script src="/assets/app.js" defer/></>;}
