import { z } from 'zod';

// Agent-authored research records complement independent live source verification.
export const researchReviewSchema = z.object({
  company_review: z.string().min(60).max(2000),
  person_review: z.string().min(60).max(2000),
  selection_reason: z.string().min(30).max(1000),
  checked_at: z.string().datetime(),
  sources: z.array(z.string().url()).min(2).max(20),
  conflict_queries: z.array(z.string().min(8).max(300)).min(1).max(10),
  conflict_outcome: z.string().min(30).max(1000),
  unresolved_conflict: z.boolean(),
  limitations: z.string().min(10).max(1000),
});

export function validateResearchReview(review, sourceURL, now = Date.now()) {
  const r = researchReviewSchema.parse(review);
  if (r.unresolved_conflict) throw Error('Resolve conflicting employment evidence before outreach');
  const age = now - Date.parse(r.checked_at);
  if (age < -300000 || age > 86400000) throw Error('Company and person research must be reviewed within 24 hours');
  if (new Set(r.sources).size < 2) throw Error('Review at least two distinct original source pages');
  for (const url of r.sources) sourceURL(url);
  return r;
}

export const RESEARCH_CHECKLIST = [
  'Confirm Saudi operations, official domain, electrical/electronics activity and a realistic junior contribution. Separate dated evidence from undated marketing.',
  'Establish the person’s full name, current employer, role and exact published individual work email. Explain why this person is relevant.',
  'Search the name, company aliases and role in English and Arabic where useful. Record actual queries, job-change evidence, namesakes and unresolved conflicts.',
  'Review at least two distinct original pages. A directory is a discovery source; retrieval time is not publication time.',
  'Record limitations honestly. No vacancy is needed for a paid-junior referral inquiry, and an ineligible vacancy does not disqualify its employer.',
];
