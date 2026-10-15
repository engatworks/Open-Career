import type { Metadata } from 'next';
export const metadata:Metadata={title:'Open Career — your next chapter',description:'Your private workspace for researched employers, thoughtful introductions and real conversations.',icons:{icon:'/assets/logo.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body style={{margin:0}}>{children}</body></html>;}
