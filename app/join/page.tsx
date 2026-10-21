import JoinClient from './join-client';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'Open Career — Your workspace',description:'Your private career profile, verified opportunities and application workspace.'};
export const dynamic='force-dynamic';
export default function JoinPage(){return <JoinClient/>;}
