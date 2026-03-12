/**
 * evalStories.js — Real Candidate Story Eval
 *
 * Purpose:
 *   Run 6 real candidate stories through the live /api/analyze endpoint
 *   and rate two dimensions:
 *     1. SOARR score accuracy  — are the scores right given what was said?
 *     2. Coaching summary relevance — is the summary actionable and specific?
 *
 * Usage:
 *   node scripts/evalStories.js                  → runs all 6 stories
 *   node scripts/evalStories.js --story 2        → runs one story by index (1-6)
 *   node scripts/evalStories.js --verbose        → prints full API response per story
 *
 * Output:
 *   Console: per-story ratings + final summary table
 *   File:    eval_stories_results_[timestamp].json
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const OpenAI = require('openai');
const fetch  = require('node-fetch');
const fs     = require('fs');
const path   = require('path');

const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const API_URL = process.env.API_URL || 'http://localhost:3000/api/analyze';

// ─── CLI flags ────────────────────────────────────────────────────────────────
const SINGLE_STORY = process.argv.includes('--story')
  ? parseInt(process.argv[process.argv.indexOf('--story') + 1])
  : null;

const VERBOSE = process.argv.includes('--verbose');

// ─── Stories ─────────────────────────────────────────────────────────────────
const STORIES = [
  {
    id:          1,
    label:       'Technical Challenge — SSO/IDP auth failure',
    questionId:  361,
    question:    'Describe a technical program you ran (with architecture diagram). What technical gaps did you identify and how did you mitigate risks?',
    category:    'Technical',
    userAnswer: `I led an IDP-to-Service Provider integration for 5,000+ healthcare clinicians requiring SSO with GDPR compliance and sub-300ms performance.
Key assumption SP and IDP will always we be in sync with each other and email id is the unique identifier that maps two env together.
Post-launch, 15% of users failed authentication. I analyzed 1,000+ log entries and found the root cause: duplicate email addresses in the SP database. We'd assumed email was a unique identifier—it wasn't.
The API returned generic error codes, so users got ambiguous messages and couldn't log in.
I coordinated with the SP team, confirmed data duplicates via database review, and drove two fixes:
Short-term: Modified API to return specific 409 error codes for duplicates, enabling manual support resolution
Long-term: Added a mapping layer using system-generated GUIDs as unique identifiers instead of emails
Cleaner DB in the SP side with fixed sources manipulating the DB - Technical Debt
Enabled better error handling, user messaging, and manual resolution. Sign-in success improved from 70% → 95%.
State assumptions clearly, but always plan for when they break. When integrating with external systems you don't control, SLAs aren't enough—design graceful failure handling while permanent fixes are developed, like our interim error codes that unblocked users during the mapping layer build.`,
    expected_soarr: {
      situation:  { min: 4, max: 5, reason: 'Specific system, user count, constraints all stated' },
      obstacle:   { min: 4, max: 5, reason: 'Clear root cause — duplicate emails, 15% failure rate' },
      action:     { min: 4, max: 5, reason: 'Two concrete fixes with short/long term split' },
      result:     { min: 4, max: 5, reason: '70%→95% success rate explicitly stated' },
      reflection: { min: 4, max: 5, reason: 'Explicit lesson about assumption validation and graceful failure' }
    },
    expected_coaching: {
      signal_density: 'medium',
      weakness_pattern_contains: ['seniority', 'metrics', 'structure'],
      one_thing_should_mention: ['architecture', 'diagram', 'technical gaps', 'risk', 'assumption']
    }
  },
  {
    id:          2,
    label:       'Disagreed with manager — was wrong (GDPR caching)',
    questionId:  333,
    question:    'Tell me about a time you strongly disagreed with your manager on something you deemed very important to the business.',
    category:    'Behavioral',
    userAnswer: `Situation (15 seconds): "I was leading an IDP integration with conflicting requirements: GDPR compliance meant no customer data storage, but we needed sub-300ms performance. Engineering recommended caching to improve speed, but I disagreed—I believed it violated our compliance constraints and pushed back strongly."

Problem (12 seconds): "Two weeks before launch, we were still at 600ms—double our SLA. Our VP was asking 'Why are we still slow?' and the customer was getting nervous. I realized: I might be the blocker."

Action (60 seconds): "First, I admitted I might be wrong and needed to investigate deeper.
I set up an urgent meeting with our compliance team and asked a specific question: 'What exactly defines PII that we cannot cache?'
The answer changed everything: System-generated GUIDs are NOT considered PII—only personal identifiers like names, emails, and addresses are restricted.
I reviewed our architecture—our mapping table only contained random GUIDs from the IDP mapped to user IDs in the SP. No personal data at all.
I brought this written approval back to the engineering team and said, 'You were right. Let's redesign the caching strategy.'
We implemented caching for the mapping table containing only GUIDs and approved attributes. This was a hot fix that dramatically improved performance while staying compliant.
I also documented this decision in an Architecture Decision Record so future teams wouldn't waste time re-debating what we'd already resolved with compliance."

Result (20 seconds): "We achieved 70% cache hit rate, reduced latency from 600ms to 280ms—well under our 300ms SLA—and passed GDPR audit with zero findings.
Engineering was right from day one—I just didn't understand the requirement clearly enough."
Learning (33 seconds): "Three key lessons:
First, don't confuse 'being careful' with 'being right.' I thought I was protecting compliance, but I was blocking the solution because I hadn't clarified what compliance actually required.
Second, involve the right stakeholders early. I should've called compliance in week 1 during design, not week 10 during crisis mode.
Third, document decisions. When you resolve a conflict, capture the reasoning in an ADR so future teams don't waste time relitigating the same issue. Now this GUID caching pattern is our standard for similar integrations."`,
    expected_soarr: {
      situation:  { min: 4, max: 5, reason: 'Specific integration, competing constraints, VP pressure stated' },
      obstacle:   { min: 4, max: 5, reason: 'Clear blocker — own misunderstanding of GDPR scope' },
      action:     { min: 4, max: 5, reason: 'Specific steps: compliance meeting, exact question asked, ADR' },
      result:     { min: 4, max: 5, reason: '600→280ms, 70% cache hit rate, zero audit findings' },
      reflection: { min: 5, max: 5, reason: 'Three explicit lessons stated with behavioral changes' }
    },
    expected_coaching: {
      signal_density: 'medium',
      weakness_pattern_contains: ['seniority', 'over_explained'],
      one_thing_should_mention: ['concise', 'senior signal', 'judgment', 'ADR', 'stakeholder']
    }
  },
  {
    id:          3,
    label:       'Influence without authority — sentiment tool',
    questionId:  353,
    question:    'What do you do when you need the support of a cross-functional team but they say they don\'t have time to help?',
    category:    'Partnership',
    userAnswer: `Situation (15 seconds): "Working on a data analytics project, I found business analysts spending 15 hours weekly manually processing customer feedback in Excel. I proposed integrating our existing sentiment tool to automate this and fix our broken CSAT metric. Engineering manager pushed back—said it was scope creep."

Task (8 seconds): "My goal was to influence stakeholders to see the business value without direct authority over engineering."

Action (70 seconds): "I built an evidence-based case:
First, validated the problem: Interviewed analysts and marketing—confirmed 100+ weekly feedback entries taking 15 hours, and leadership had zero CSAT visibility.
Second, proved feasibility and value: Partnered with sister teams already using the tool. They showed 60% time savings and confirmed implementation was straightforward.
Third, addressed scope concern: Demonstrated the tool used standard APIs—this was configuration, not new development. One sprint of work.
Then I aligned stakeholders:
Leadership: ROI and fast customer feedback iteration
Analysts: 60% time savings
Marketing: in-app feedback visibility
Engineering: showed sister team completed it in two sprint
Created a shared roadmap to show it was well-planned, not ad-hoc."

Result (27 seconds): "Secured unanimous buy-in, approved for Q2.
Results:
Enabled CSAT metric for first time—leadership got visibility
Reduced manual work from 15 to 6 hours weekly
Improved user experience
Key learning: Replace opinion with data—sister team proof, quantified impact, and concrete scope made the decision easy."`,
    expected_soarr: {
      situation:  { min: 4, max: 5, reason: 'Specific problem, 15hrs/week, broken CSAT metric stated' },
      obstacle:   { min: 4, max: 5, reason: 'Engineering pushback with specific reason (scope creep)' },
      action:     { min: 4, max: 5, reason: 'Structured 3-step evidence case with per-stakeholder alignment' },
      result:     { min: 4, max: 5, reason: '15→6 hours, CSAT enabled, Q2 approval' },
      reflection: { min: 3, max: 5, reason: 'Lesson stated about data over opinion' }
    },
    expected_coaching: {
      signal_density: 'medium',
      weakness_pattern_contains: ['seniority', 'metrics', 'over_explained'],
      one_thing_should_mention: ['influence', 'stakeholder', 'data', 'senior', 'concise']
    }
  },
  {
    id:          4,
    label:       'Pivoted mid-project — troubleshooter adoption',
    questionId:  334,
    question:    'Tell me about a time you had significant, unanticipated obstacles to overcome in achieving a key goal. Were you eventually successful?',
    category:    'Behavioral',
    userAnswer: `Situation (15 seconds): "I led an initiative to improve adoption of our troubleshooting tool used by 200+ engineers to solve customer cases faster directly impacting the key KPI Customer pain time. However, the other key KPI Days to solution benefit was reducing. Assumption was internal tool migration is leading to the drop in the DTS benefit."

Pivot (12 seconds): "After surveying engineers, migration was only 2-5% of the issue. Week 3, I pivoted completely and reframed the problem."

New Approach (20 seconds): "I divided the problem into two sides:
Writers: 16 SMEs creating the content—what's blocking them?
Consumers: 200+ engineers using it—segmented by tenure (<12 months vs experienced)
Each segment had different pain points."

Action - Prioritization (20 seconds): "With 500+ troubleshooters, I couldn't fix everything. Built a data model tracking case volume, completion rates, customer pain time, and feedback. This showed the top 20 handled 60% of cases—focused all fixes there."

Action - Execution (25 seconds): "Short-term wins (2-3 weeks):
Created training videos for new engineers
Added visual workflows to top 10 verbose troubleshooters
Fixed critical migration bugs
Manually corrected 20 mis-tagged cases
Long-term:
Proposed automation to fix SAP-to-GT mapping using historical case data"

Result (8 seconds): "Within 8 weeks: 25% adoption increase, 10% improvement in customer pain time resolution. Created scalable model for all regions."

Learning (5 seconds): "Don't anchor on first hypothesis. Pivot fast, segment problems, use data to prioritize high-impact work."`,
    expected_soarr: {
      situation:  { min: 4, max: 5, reason: '200+ engineers, KPI stated, leadership hypothesis given' },
      obstacle:   { min: 4, max: 5, reason: 'Initial hypothesis wrong — pivot forced in week 3' },
      action:     { min: 4, max: 5, reason: 'Data model, segmentation, short/long term split' },
      result:     { min: 4, max: 5, reason: '25% adoption, 10% CPT improvement in 8 weeks' },
      reflection: { min: 3, max: 5, reason: 'Lesson about hypothesis anchoring stated' }
    },
    expected_coaching: {
      signal_density: 'medium',
      weakness_pattern_contains: ['seniority', 'over_explained', 'structure'],
      one_thing_should_mention: ['hypothesis', 'pivot', 'data', 'senior', 'concise']
    }
  },
  {
    id:          5,
    label:       'Red to Green — identity project recovery',
    questionId:  343,
    question:    'Describe a time when you disagreed with a colleague and your initial stance was not clearly correct.',
    category:    'Behavioral',
    userAnswer: `The first release of the identity integration project failed badly. The customer was unhappy with the UI, missing components, and overall quality. Trust between our dev team and the customer was completely broken, and they were threatening to escalate.
My goal was to identify what went wrong, rebuild customer trust, and move the project from RED to GREEN within 8 weeks before the customer walked away
First , root cause analysis - I met with dev and QA teams to understand the issues. Found three problems: no formal release process, and change requests handled informally over chat. Also no test strategy, which caused us to miss different user scenarios.
Second - building transparency to gain trust - I established structured communication -
Daily standups for the dev team
Weekly demos with the customer so they could see progress incrementally
Single source of truth JIRA board
Live dashboard tracking progress and blockers
Weekly email updates to leadership
Third, fix the process.
Implemented formal release management: Dev → Staging → UAT -> Production with demos at each gate
All change requests logged in JIRA and reviewed before development
Defined quality gates: 80% test coverage, zero high-priority bugs at deployment
Mapped test cases to user stories to ensure we covered all scenarios"
Result (15 seconds): "Within 8 weeks, project moved from RED to GREEN. Customer confidence restored. Deployment success hit 95% with no rollbacks. Authentication APIs maintained 99.9% uptime with sub-500ms response times. Most importantly, the customer extended the contract."
Learning (15 seconds): "Key lesson: Difficult stakeholders usually have legitimate concerns. Rebuild trust through radical transparency—show progress early and often. Quick wins prove responsiveness.`,
    expected_soarr: {
      situation:  { min: 3, max: 5, reason: 'Failed launch, broken trust, threat to escalate — but no initial disagreement framing' },
      obstacle:   { min: 4, max: 5, reason: 'Three root causes identified clearly' },
      action:     { min: 4, max: 5, reason: 'Structured transparency + process fixes with specifics' },
      result:     { min: 4, max: 5, reason: '95% deployment, 99.9% uptime, contract extended' },
      reflection: { min: 3, max: 5, reason: 'Lesson about transparency stated' }
    },
    expected_coaching: {
      signal_density: 'medium',
      weakness_pattern_contains: ['structure', 'seniority', 'narrative'],
      one_thing_should_mention: ['disagree', 'colleague', 'wrong', 'trust', 'alignment']
    }
  },
  {
    id:          6,
    label:       'Email OTP lockout — async resilience',
    questionId:  358,
    question:    'You identify a new bug 2 days before the release of your new product feature. What do you do?',
    category:    'Technical',
    userAnswer: `Situation (20 seconds): "So we had this really frustrating problem—about 15% of users were getting locked out when trying to reset their passwords. Turns out, our email vendor was sometimes slow sending the OTP codes. Users wouldn't get the email right away, so they'd hit 'resend' a bunch of times, which triggered our anti-abuse rate limiting. Basically, our security feature was making the problem worse."

Task (10 seconds): "I needed to fix the lockouts without compromising security, and make our system resilient to the vendor being unpredictable—because honestly, we couldn't control when they'd send emails."

Action (70 seconds): "First thing I did was get on a call with the vendor and our engineering team. I asked them point-blank: 'What can you actually guarantee?' Turns out 'fast email delivery' means different things to different people. We defined it—under 30 seconds is great, under 2 minutes is acceptable, over 2 minutes is a problem.
That helped us realize we couldn't just sit there waiting for the email to go out. So we redesigned it to be asynchronous. Our system publishes a 'send this OTP' message to a queue, the vendor acknowledges they got the request—not that they delivered it—and we move on. We're not blocked anymore.
But we still needed to know if the email actually got delivered, right? So we had the vendor implement webhooks. When the email goes out, they ping us back. If we don't get that ping, we know something's wrong and can retry or alert someone.
On the user side, we changed the messaging. Instead of making it look instant, we tell them 'Check your email in the next minute or two.' Sounds simple, but it stopped people from freaking out and hitting resend five times.
And we added monitoring—if the vendor's acknowledgment doesn't come back in time, we get alerted before it becomes a user-facing disaster."

Result (15 seconds): "Lockouts went from 15% down to 2%. Success rate jumped from 85% to 97%. The real test came when the vendor had a 15-minute outage—our queuing and retry logic handled it, and literally zero users were impacted. That's when I knew the design worked."

Learning (10 seconds): "The big takeaway? When you're working with third parties, you can't just trust their SLAs. You have to design like they're going to fail, because eventually they will. Async patterns and graceful degradation aren't just nice-to-haves—they're critical."`,
    expected_soarr: {
      situation:  { min: 3, max: 4, reason: 'Problem stated but this is an ongoing issue not a 2-days-before-release scenario' },
      obstacle:   { min: 4, max: 5, reason: 'Vendor unpredictability + rate limiting conflict clearly stated' },
      action:     { min: 4, max: 5, reason: 'Async queue, webhooks, UX change, monitoring — all specific' },
      result:     { min: 4, max: 5, reason: '15%→2% lockouts, 85%→97% success, outage test passed' },
      reflection: { min: 4, max: 5, reason: 'Clear lesson about third-party design philosophy' }
    },
    expected_coaching: {
      signal_density: 'medium',
      weakness_pattern_contains: ['structure', 'seniority', 'narrative'],
      one_thing_should_mention: ['release', 'bug', 'decision', 'ship', 'hold', 'escalate']
    }
  }
];

// ─── withRetry ────────────────────────────────────────────────────────────────
// Retries an async fn up to maxRetries times on 429 rate limit errors.
async function withRetry(fn, maxRetries = 3, baseDelay = 15000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.status === 429 || err?.code === 'insufficient_quota' ||
                    (err?.message || '').includes('429');
      if (is429 && attempt < maxRetries) {
        const delay = baseDelay * attempt;
        console.log(`\n    ⚠️  Rate limit — waiting ${delay/1000}s (retry ${attempt}/${maxRetries - 1})...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

// ─── callAPI ──────────────────────────────────────────────────────────────────
async function callAPI(story) {
  const response = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      questionId:     story.questionId,
      userAnswer:     story.userAnswer,
      candidateLevel: 'Senior'
    })
  });

  if (!response.ok) throw new Error(`API returned ${response.status}`);
  const json = await response.json();
  if (!json.success) throw new Error(`API error: ${JSON.stringify(json.error)}`);
  return json.data;
}

// ─── assertResponseIntegrity ─────────────────────────────────────────────────
// Validates API response has required fields before running judge calls.
// Catches broken prompt regressions that produce structurally incomplete output.
// If this fails, the story is marked as a regression — not a score failure.
function assertResponseIntegrity(apiResponse, storyLabel) {
  const checks = {
    has_soarr:            !!apiResponse.soarr,
    has_all_components:   ['situation','obstacle','action','result','reflection']
                            .every(c => apiResponse.soarr?.[c]?.score != null),
    has_coaching_summary: !!apiResponse.coaching_summary,
    has_improvements:     Array.isArray(apiResponse.improvements),
    no_fallback:          apiResponse.analysis_status !== 'fallback',
    scores_in_range:      ['situation','obstacle','action','result','reflection']
                            .every(c => {
                              const s = apiResponse.soarr?.[c]?.score;
                              return typeof s === 'number' && s >= 1 && s <= 5;
                            })
  };

  const failures = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (failures.length > 0) {
    console.error(`\n    🚨 Response integrity FAILED [${storyLabel}]: ${failures.join(', ')}`);
    console.error('    This is likely a prompt regression — check buildSoarrPrompt()');
    return false;
  }

  console.log('    ✅ Response integrity: all checks passed');
  return true;
}

// ─── rateSoarr ────────────────────────────────────────────────────────────────
// Uses GPT-4o to rate SOARR score accuracy against expected ranges.
async function rateSoarr(story, apiResponse) {
  const actualScores = {};
  for (const comp of ['situation', 'obstacle', 'action', 'result', 'reflection']) {
    actualScores[comp] = apiResponse.soarr?.[comp]?.score ?? null;
  }

  const prompt = `You are evaluating SOARR score accuracy for a TPM interview coaching system.

QUESTION: "${story.question}"

CANDIDATE ANSWER:
"${story.userAnswer}"

ACTUAL SCORES GIVEN:
${JSON.stringify(actualScores, null, 2)}

EXPECTED SCORE RANGES:
${JSON.stringify(story.expected_soarr, null, 2)}

For each SOARR component, evaluate:
1. Is the actual score within the expected range (min/max)?
2. Is the score justified given what the candidate actually said?
3. Did the model miss evidence that was clearly present?
4. Did the model over-score something that wasn't actually said?

Return JSON only:
{
  "component_ratings": {
    "situation":  { "actual": 0, "expected_min": 0, "expected_max": 0, "in_range": true, "correct": true, "note": "..." },
    "obstacle":   { "actual": 0, "expected_min": 0, "expected_max": 0, "in_range": true, "correct": true, "note": "..." },
    "action":     { "actual": 0, "expected_min": 0, "expected_max": 0, "in_range": true, "correct": true, "note": "..." },
    "result":     { "actual": 0, "expected_min": 0, "expected_max": 0, "in_range": true, "correct": true, "note": "..." },
    "reflection": { "actual": 0, "expected_min": 0, "expected_max": 0, "in_range": true, "correct": true, "note": "..." }
  },
  "soarr_accuracy_score": 0,
  "components_in_range": 0,
  "biggest_error": "...",
  "overall_note": "..."
}

soarr_accuracy_score: percentage of components where actual score is both in_range AND justified (0-100).
components_in_range: count of components where actual is within expected min/max.`;

  const response = await openai.chat.completions.create({
    model:           'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an expert TPM interview evaluator. Return only valid JSON.' },
      { role: 'user',   content: prompt }
    ],
    temperature:     0.2,
    max_tokens:      1000,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
}

// ─── rateCoachingSummary ──────────────────────────────────────────────────────
// Rates coaching_summary relevance and specificity to this candidate's story.
async function rateCoachingSummary(story, apiResponse) {
  const coaching = apiResponse.coaching_summary;
  if (!coaching) return { coaching_score: 0, note: 'coaching_summary was null' };

  const prompt = `You are evaluating the quality of a TPM interview coaching summary.

QUESTION: "${story.question}"
CATEGORY: ${story.category}

CANDIDATE ANSWER:
"${story.userAnswer}"

COACHING SUMMARY PRODUCED:
${JSON.stringify(coaching, null, 2)}

EXPECTED SIGNALS:
- signal_density should be around: ${story.expected_coaching.signal_density}
- weakness_pattern should relate to one of: ${story.expected_coaching.weakness_pattern_contains.join(', ')}
- one_thing should mention something about: ${story.expected_coaching.one_thing_should_mention.join(', ')}

Rate the coaching summary on these dimensions (1-5 each):

1. RELEVANCE: Is the coaching specific to THIS candidate's answer, not generic?
   5 = references their specific project, domain, or words
   1 = could apply to any candidate

2. ACCURACY: Does weakness_pattern correctly identify the real gap in this answer?
   5 = pattern matches the actual weakness in the answer
   1 = wrong pattern — misdiagnosed the problem

3. ACTIONABILITY: Is one_thing and daily_drill something the candidate can act on today?
   5 = specific, concrete, directly addresses the gap
   1 = vague ("be more specific", "add more detail")

4. INTERVIEWER_READ accuracy: Does the interviewer_read correctly describe what a real interviewer would think?
   5 = accurate read of the answer's strengths and gaps
   1 = misses the obvious or fabricates impressions

5. SIGNAL_DENSITY fit: Is the signal_density label correct for this answer?
   5 = label matches the actual density of the answer
   1 = wrong label

Return JSON only:
{
  "dimension_scores": {
    "relevance":        0,
    "accuracy":         0,
    "actionability":    0,
    "interviewer_read": 0,
    "signal_density_fit": 0
  },
  "coaching_score": 0,
  "weakness_pattern_correct": true,
  "signal_density_correct": true,
  "one_thing_relevant": true,
  "best_element": "...",
  "worst_element": "...",
  "overall_note": "..."
}

coaching_score: average of all 5 dimension scores (1-5).`;

  const response = await openai.chat.completions.create({
    model:           'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an expert TPM interview evaluator. Return only valid JSON.' },
      { role: 'user',   content: prompt }
    ],
    temperature:     0.2,
    max_tokens:      800,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
}

// ─── runStory ─────────────────────────────────────────────────────────────────
async function runStory(story) {
  console.log(`\n─── [${story.id}/6] ${story.label} ───`);
  console.log(`    Q${story.questionId}: ${story.question.substring(0, 70)}...`);

  let apiResponse;
  try {
    process.stdout.write('    📡 Calling /api/analyze...');
    apiResponse = await callAPI(story);
    console.log(' ✓');
  } catch (err) {
    console.log(`\n    ❌ API call failed: ${err.message}`);
    return { story, error: err.message };
  }

  // Response integrity check — catches prompt regressions before spending
  // judge tokens on structurally broken output.
  const integrityOk = assertResponseIntegrity(apiResponse, story.label);
  if (!integrityOk) {
    return { story, error: 'response_integrity_failed', regression: true };
  }

  // Wait for GPT-4o token bucket to refill before judge calls
  process.stdout.write('    ⏳ Cooling down 35s for rate limit...');
  await new Promise(r => setTimeout(r, 35000));
  console.log(' done');

  if (VERBOSE) {
    console.log('\n    Full API response:');
    console.log(JSON.stringify(apiResponse, null, 4));
  }

  // Print raw SOARR scores
  const soarr = apiResponse.soarr || {};
  const scoreStr = ['situation','obstacle','action','result','reflection']
    .map(c => `${c[0].toUpperCase()}:${soarr[c]?.score ?? '?'}`)
    .join('  ');
  console.log(`    Scores  : ${scoreStr}`);

  process.stdout.write('    🧠 Rating SOARR accuracy...');
  const soarrRating = await withRetry(() => rateSoarr(story, apiResponse));
  console.log(` ✓  (${soarrRating.soarr_accuracy_score}% accurate, ${soarrRating.components_in_range}/5 in range)`);

  process.stdout.write('    🧠 Rating coaching summary...');
  const coachingRating = await withRetry(() => rateCoachingSummary(story, apiResponse));
  console.log(` ✓  (score: ${coachingRating.coaching_score?.toFixed(1)}/5)`);

  // Print component details
  console.log('\n    SOARR component breakdown:');
  for (const [comp, rating] of Object.entries(soarrRating.component_ratings || {})) {
    const status = rating.in_range ? '✅' : '❌';
    const expected = `[${rating.expected_min}-${rating.expected_max}]`;
    console.log(`      ${status} ${comp.padEnd(10)} got ${rating.actual} expected ${expected}  ${rating.note}`);
  }
  if (soarrRating.biggest_error) {
    console.log(`    ⚠️  Biggest error: ${soarrRating.biggest_error}`);
  }

  // Print coaching summary details
  console.log('\n    Coaching summary breakdown:');
  const dims = coachingRating.dimension_scores || {};
  for (const [dim, score] of Object.entries(dims)) {
    const bar = '█'.repeat(score) + '░'.repeat(5 - score);
    console.log(`      ${dim.padEnd(20)} ${bar} ${score}/5`);
  }
  console.log(`    weakness_pattern: "${apiResponse.coaching_summary?.weakness_pattern}" — ${coachingRating.weakness_pattern_correct ? '✅ correct' : '❌ wrong'}`);
  console.log(`    signal_density:   "${apiResponse.coaching_summary?.signal_density}" — ${coachingRating.signal_density_correct ? '✅ correct' : '❌ wrong'}`);
  console.log(`    one_thing relevant: ${coachingRating.one_thing_relevant ? '✅' : '❌'}`);
  if (coachingRating.worst_element) {
    console.log(`    worst element: ${coachingRating.worst_element}`);
  }

  return {
    story_id:        story.id,
    label:           story.label,
    questionId:      story.questionId,
    soarr_scores:    Object.fromEntries(
      ['situation','obstacle','action','result','reflection'].map(c => [c, soarr[c]?.score ?? null])
    ),
    soarr_accuracy:  soarrRating.soarr_accuracy_score,
    components_in_range: soarrRating.components_in_range,
    soarr_details:   soarrRating,
    coaching_score:  coachingRating.coaching_score,
    coaching_details: coachingRating,
    apiResponse:     VERBOSE ? apiResponse : {
      soarr:            apiResponse.soarr,
      coaching_summary: apiResponse.coaching_summary,
      analysis_status:  apiResponse.analysis_status
    }
  };
}

// ─── printSummary ─────────────────────────────────────────────────────────────
function printSummary(results) {
  const valid = results.filter(r => !r.error);

  console.log('\n');
  console.log('='.repeat(65));
  console.log('  EVAL RESULTS — REAL CANDIDATE STORIES');
  console.log('='.repeat(65));
  console.log(`  Stories tested    : ${results.length}`);
  console.log(`  Errors            : ${results.filter(r => r.error).length}`);
  console.log('');

  // Per-story table
  console.log('  Story                              SOARR%  In-Range  Coaching');
  console.log('  ' + '-'.repeat(63));
  for (const r of valid) {
    const label    = r.label.substring(0, 34).padEnd(34);
    const soarr    = String(r.soarr_accuracy).padStart(5) + '%';
    const inRange  = `${r.components_in_range}/5`.padStart(8);
    const coaching = r.coaching_score?.toFixed(1).padStart(8) + '/5';
    console.log(`  ${label}  ${soarr}  ${inRange}  ${coaching}`);
  }

  // Averages
  const avgSoarr    = valid.reduce((s, r) => s + r.soarr_accuracy, 0) / valid.length;
  const avgInRange  = valid.reduce((s, r) => s + r.components_in_range, 0) / valid.length;
  const avgCoaching = valid.reduce((s, r) => s + (r.coaching_score || 0), 0) / valid.length;

  console.log('  ' + '-'.repeat(63));
  console.log(`  ${'AVERAGE'.padEnd(34)}  ${avgSoarr.toFixed(0).padStart(5)}%  ${avgInRange.toFixed(1).padStart(8)}  ${avgCoaching.toFixed(1).padStart(8)}/5`);

  // SOARR component averages across all stories
  console.log('');
  console.log('  SOARR component accuracy (% of stories where score was in expected range):');
  const components = ['situation', 'obstacle', 'action', 'result', 'reflection'];
  for (const comp of components) {
    const inRange = valid.filter(r =>
      r.soarr_details?.component_ratings?.[comp]?.in_range
    ).length;
    const pct = Math.round(inRange / valid.length * 100);
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    console.log(`    ${comp.padEnd(12)} ${bar} ${pct}%  (${inRange}/${valid.length})`);
  }

  // Coaching pattern accuracy
  console.log('');
  const patternCorrect  = valid.filter(r => r.coaching_details?.weakness_pattern_correct).length;
  const densityCorrect  = valid.filter(r => r.coaching_details?.signal_density_correct).length;
  const oneThingCorrect = valid.filter(r => r.coaching_details?.one_thing_relevant).length;
  console.log(`  Coaching summary accuracy:`);
  console.log(`    weakness_pattern correct : ${patternCorrect}/${valid.length}`);
  console.log(`    signal_density correct   : ${densityCorrect}/${valid.length}`);
  console.log(`    one_thing relevant       : ${oneThingCorrect}/${valid.length}`);

  // Pass/fail gate
  console.log('');
  const soarrPass    = avgSoarr >= 80;
  const coachingPass = avgCoaching >= 3.5;
  console.log(`  Gate: SOARR accuracy ≥80%    ${soarrPass    ? '✅ PASS' : '❌ FAIL'}  (${avgSoarr.toFixed(0)}%)`);
  console.log(`  Gate: Coaching score ≥3.5/5  ${coachingPass ? '✅ PASS' : '❌ FAIL'}  (${avgCoaching.toFixed(1)})`);
  console.log('='.repeat(65));
}

// ─── runSparseRegressionTest ─────────────────────────────────────────────────
// Runs a deliberately sparse answer through the API before main eval stories.
// A healthy pipeline must score obstacle=1, result=1, reflection=1 for this input.
// If the model hallucinates context (from a broken prompt), these will score > 1.
// Cost: 1 API call. Catches prompt regressions that quality evals miss.
async function runSparseRegressionTest() {
  console.log('\n🔬 Pre-flight: sparse regression test...');

  const sparsePayload = {
    questionId:     343,
    userAnswer:     'I defined the exit criterion.',
    candidateLevel: 'Senior'
  };

  let response;
  try {
    const res = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(sparsePayload),
      timeout: 60000
    });
    response = await res.json();
  } catch (err) {
    console.warn(`    ⚠️  Sparse test skipped — API error: ${err.message}`);
    return true; // non-fatal — don't block main eval
  }

  const soarr = response?.soarr || {};
  const checks = {
    obstacle_is_1:   (soarr.obstacle?.score  ?? 99) <= 1,
    result_is_1:     (soarr.result?.score    ?? 99) <= 1,
    reflection_is_1: (soarr.reflection?.score ?? 99) <= 1
  };

  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);

  if (failures.length > 0) {
    console.error(`    🚨 Sparse regression FAILED: ${failures.join(', ')}`);
    console.error('    Model is hallucinating context — check buildSoarrPrompt() dynamic data');
    console.error(`    Scores: O:${soarr.obstacle?.score} R:${soarr.result?.score} Ref:${soarr.reflection?.score}`);
    return false;
  }

  console.log(`    ✅ Sparse test passed — O:${soarr.obstacle?.score} R:${soarr.result?.score} Ref:${soarr.reflection?.score} (all ≤1 as expected)`);
  return true;
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const stories = SINGLE_STORY
    ? STORIES.filter(s => s.id === SINGLE_STORY)
    : STORIES;

  // Run sparse regression test before main stories (skip if --story flag used)
  if (!SINGLE_STORY) {
    const sparseOk = await runSparseRegressionTest();
    if (!sparseOk) {
      console.error('\n❌ Aborting eval — sparse regression test failed. Fix prompt before running stories.');
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 20000)); // cooldown after pre-flight call
  }

  if (stories.length === 0) {
    console.error(`Story ${SINGLE_STORY} not found. Valid IDs: 1-6`);
    process.exit(1);
  }

  console.log('='.repeat(65));
  console.log('  REAL CANDIDATE STORY EVAL');
  console.log(`  ${stories.length} stories × Senior level`);
  console.log(`  Dimensions: SOARR accuracy + coaching summary relevance`);
  console.log(`  API: ${API_URL}`);
  console.log('='.repeat(65));

  const results = [];
  for (const story of stories) {
    const result = await runStory(story);
    results.push(result);
    // Pause between stories — 4 GPT-4o calls per story, need breathing room
    if (stories.indexOf(story) < stories.length - 1) {
      const pause = 20000;
      process.stdout.write(`\n    ⏳ Waiting ${pause/1000}s before next story...`);
      await new Promise(r => setTimeout(r, pause));
      console.log(' done');
    }
  }

  printSummary(results);

  // Save full results
  const timestamp  = Date.now();
  const outputPath = path.join(__dirname, `../eval_stories_results_${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Full results saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});