import test from 'node:test';
import assert from 'node:assert/strict';
import { assessOpportunity, OPPORTUNITY_TEXT_LIMIT } from '../lib/opportunity-fit.mjs';
const intro='We are recruiting a graduate engineer for electrical design and technical documentation. ';
const review=(suffix,overrides={})=>assessOpportunity({text:intro+suffix,needsSponsorship:true,authorizedToWork:false,yearsExperience:0,currentCountry:'Saudi Arabia',...overrides});
test('does not invent sponsorship when it is not stated',()=>{
 const result=review('Strong communication and spreadsheet skills are desirable.');
 assert.equal(result.sponsorship,'not-stated');
 assert.equal(result.verdict,'needs-review');
 assert.ok(result.signals.some(x=>x.kind==='sponsorship'&&x.severity==='review'&&!x.quote));
});
test('positive sponsorship is encouraging, not a verified eligibility claim',()=>{
 const result=review('Visa sponsorship is available for suitable international applicants.');
 assert.equal(result.sponsorship,'mentioned');
 assert.equal(result.verdict,'no-obvious-conflict');
 assert.ok(result.summary.includes('not confirmed'));
});
test('clear sponsorship refusal blocks applicants who need it',()=>{
 const result=review('We do not offer visa sponsorship for this position.');
 assert.equal(result.sponsorship,'not-offered');
 assert.equal(result.verdict,'likely-ineligible');
 assert.ok(result.signals.some(x=>x.severity==='blocker'&&x.quote.includes('do not offer')));
});
test('sponsorship refusal is informational for an applicant not needing it',()=>{
 const result=review('No visa sponsorship is available.',{needsSponsorship:false,authorizedToWork:true});
 assert.equal(result.verdict,'no-obvious-conflict');
});
test('different sponsorship statements produce human review rather than false certainty',()=>{
 const result=review('No visa sponsorship is available.\nHowever, visa sponsorship is available for specialized applicants.');
 assert.equal(result.sponsorship,'conflicting');
 assert.equal(result.verdict,'needs-review');
 assert.ok(result.signals.filter(x=>x.kind==='sponsorship').length===2);
});
test('explicit prerequisite authorization is detected',()=>{
 const result=review('Candidates must already be authorized to work in the United States.');
 assert.ok(result.signals.some(x=>x.kind==='work-authorization'&&x.severity==='review'));
});
test('required experience is checked when the user provides a number',()=>{
 const result=review('Minimum of 5 years of relevant experience is required.');
 assert.equal(result.verdict,'likely-ineligible');
 assert.ok(result.signals.some(x=>x.kind==='experience'&&x.detail.includes('5+ years')));
});
test('meeting the stated numeric experience threshold is not a full qualification',()=>{
 const result=review('At least 3 years of experience in engineering are required.\nVisa sponsorship is available.',{yearsExperience:4});
 assert.ok(result.signals.some(x=>x.kind==='experience'&&x.severity==='positive'));
 assert.equal(result.verdict,'no-obvious-conflict');
});
test('missing experience is marked unknown, not silently assumed zero',()=>{
 const result=review('5+ years of experience required.\nVisa sponsorship is available.',{yearsExperience:null});
 assert.equal(result.verdict,'needs-review');
});
test('optional experience should not become a hard blocker',()=>{
 const result=review('5+ years of experience preferred; graduate applications welcome.\nVisa sponsorship is available.');
 assert.ok(!result.signals.some(x=>x.kind==='experience'));
});
test('remote country restrictions are noted without inventing an immigration decision',()=>{
 const result=review('Remote role only within the United States.\nVisa sponsorship is available.');
 assert.equal(result.verdict,'needs-review');
 assert.ok(result.signals.some(x=>x.kind==='location'&&x.quote.includes('United States')));
});
test('matching country does not cause a location warning',()=>{
 const result=review('Remote role only within the United States.\nVisa sponsorship is available.',{currentCountry:'United States'});
 assert.ok(!result.signals.some(x=>x.kind==='location'&&x.severity==='review'));
});
test('unlisted country is not guessed',()=>{
 const result=review('Remote role only within the United States.\nVisa sponsorship is available.',{currentCountry:'Brazil'});
 assert.ok(!result.signals.some(x=>x.kind==='location'&&x.severity==='review'));
});
test('short or empty postings are rejected',()=>{
 assert.throws(()=>assessOpportunity({text:''}),/35 characters/);
 assert.throws(()=>assessOpportunity({text:'abc'}),/35 characters/);
});
test('posts exceeding the limit are rejected',()=>{
 assert.throws(()=>assessOpportunity({text:'x'.repeat(OPPORTUNITY_TEXT_LIMIT+1)}),/24,000-character/);
});
test('invalid experience is rejected',()=>{
 assert.throws(()=>review('Visa sponsorship is available.',{yearsExperience:-1}),/between 0 and 70/);
 assert.throws(()=>review('Visa sponsorship is available.',{yearsExperience:99}),/between 0 and 70/);
});
test('quotes are bounded and derive from submitted text',()=>{
 const result=review('We do not offer visa sponsorship. '.repeat(50));
 for(const signal of result.signals)if(signal.quote)assert.ok(signal.quote.length<=300);
});
test('result never claims its findings have been verified against live policy',()=>{
 const result=review('Visa sponsorship is available.');
 assert.match(result.disclaimer,/Not a verified vacancy/);
});
