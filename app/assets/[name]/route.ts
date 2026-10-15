import { assets } from '@/lib/ui-assets';
export const dynamic='force-dynamic';
export async function GET(request:Request){const name=new URL(request.url).pathname.split('/').pop()!;const found=assets[name];return found?new Response(found.text,{headers:{'Content-Type':found.type,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}}):new Response('Not found',{status:404});}
