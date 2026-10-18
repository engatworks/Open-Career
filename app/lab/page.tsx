import type { Metadata } from 'next';
import OpportunityLab from './OpportunityLab';
import './lab.css';

export const metadata:Metadata={
  title:'Opportunity Fit Lab | Open Career',
  description:'Examine job postings for sponsorship, experience and location signals with clear evidence and no invented eligibility.',
};

export default function LabPage(){return <OpportunityLab/>;}
