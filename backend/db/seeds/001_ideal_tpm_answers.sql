-- Week 2 Seed Data: 10 Ideal TPM Interview Answers
-- These are high-quality examples for RAG semantic search

-- 1. LEADERSHIP: Cross-functional team leadership
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'leadership',
  'Tell me about a time you led a cross-functional team to deliver a complex project',
  'As TPM at Amazon, I led a 15-person team across 4 organizations (Payments, Fraud, Mobile, Data Science) to build a new checkout flow for Prime Day 2024. The project had a hard deadline of June 1st and required coordinating 12 different services. I established weekly cross-team syncs, created a shared Gantt chart tracking 47 dependencies, and implemented a risk register updated daily. When the Mobile team fell 2 weeks behind due to iOS framework issues, I negotiated with leadership to shift 2 engineers from another team and ran daily standups to unblock issues. We launched 3 days early with 99.9% uptime during Prime Day, processing 2.3M transactions with 15% faster checkout time and zero P0 incidents.',
  'As TPM at Amazon, I led a 15-person team across 4 organizations (Payments, Fraud, Mobile, Data Science) to build a new checkout flow for Prime Day 2024. The project had a hard deadline of June 1st and required coordinating 12 different services.',
  'My task was to deliver the new checkout flow on time while coordinating 4 different teams with competing priorities, managing 47 cross-service dependencies, and ensuring zero impact to existing Prime Day traffic.',
  'I established weekly cross-team syncs with all 4 organizations, created a shared Gantt chart tracking all 47 dependencies in JIRA, and implemented a risk register that I updated daily. When the Mobile team fell 2 weeks behind due to iOS framework issues, I negotiated with leadership to temporarily shift 2 engineers from another project and ran daily 15-minute standups focused purely on unblocking critical path items.',
  'We launched 3 days ahead of schedule with 99.9% uptime during Prime Day. The new checkout flow processed 2.3 million transactions, achieved 15% faster completion time compared to the old flow, and had zero P0 incidents. Leadership recognized the project as a model for cross-org collaboration.',
  5, 5, 5, 5, 5.0,
  'senior', true
);

-- 2. LEADERSHIP: Influencing without authority
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'leadership',
  'Describe a situation where you had to influence a decision without having direct authority',
  'At Google, I was TPM for infrastructure reliability but had no authority over the SRE team. They wanted to maintain 5 different monitoring tools (Prometheus, Datadog, New Relic, custom scripts, Grafana) which created 40% of our on-call burden due to alert noise and tool fragmentation. I created a cost analysis showing we spent $2.4M annually on monitoring tools plus 800 engineer-hours monthly on alert triage. I organized lunch-and-learns where I invited the SRE leads to share pain points, then presented data showing 78% of alerts were duplicates across tools. I proposed a phased migration to a unified stack, starting with a 2-team pilot. After the pilot reduced their on-call burden by 60%, I secured buy-in from 8 other SRE teams. Within 6 months, we consolidated to 2 tools, reducing monitoring costs by $1.6M/year and alert fatigue by 71%.',
  'At Google, I was TPM for infrastructure reliability but had no authority over the SRE team. They maintained 5 different monitoring tools (Prometheus, Datadog, New Relic, custom scripts, Grafana) which created significant operational overhead, but they resisted consolidation.',
  'I needed to convince the SRE team to consolidate monitoring tools without having any direct authority over them, while they were initially resistant to change due to concerns about losing flexibility.',
  'I created a comprehensive cost analysis showing $2.4M annual spend and 800 engineer-hours monthly on alert triage. I organized lunch-and-learn sessions where SRE leads could voice concerns, then presented data showing 78% of alerts were duplicates. Instead of mandating change, I proposed a low-risk 2-team pilot program and personally supported the migration.',
  'After the pilot reduced on-call burden by 60%, I secured buy-in from 8 additional SRE teams. Within 6 months, we consolidated from 5 tools to 2, reducing monitoring costs by $1.6M annually and decreasing alert fatigue by 71%. The SRE director later credited this as a model for data-driven influence.',
  5, 5, 5, 5, 5.0,
  'senior', true
);

-- 3. CONFLICT: Stakeholder disagreement
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'conflict',
  'Tell me about a time you resolved a conflict with a key stakeholder',
  'As TPM at Meta, I managed a data pipeline project where the Product Manager wanted to launch in 6 weeks to hit Q2 goals, but the Tech Lead insisted we needed 12 weeks for proper data quality validation. The PM threatened to escalate to my VP if we didn''t commit to 6 weeks. I facilitated a 2-hour working session where I had both parties document their constraints and risks. I proposed a phased approach: launch core features in 6 weeks with manual quality checks, then automate validation over the following 6 weeks. I created a detailed risk matrix showing the PM we could hit 80% of metrics in phase 1, and showed the Tech Lead we would have automated safeguards before scaling to 100M users. Both agreed. We launched on time, the PM hit Q2 goals with 78% of target metrics, and by week 10 we had full automation with zero data quality incidents in the next quarter.',
  'As TPM at Meta, the Product Manager wanted to launch a data pipeline in 6 weeks to hit Q2 goals, but the Tech Lead insisted on 12 weeks for proper data quality validation. The PM was threatening to escalate to my VP.',
  'I needed to find a solution that satisfied both the PM''s business timeline and the Tech Lead''s quality requirements, while maintaining team relationships and avoiding executive escalation.',
  'I facilitated a 2-hour working session where both parties documented their constraints and risks. I proposed a phased approach: launch core features in 6 weeks with manual quality checks, then automate validation over the following 6 weeks. I created a detailed risk matrix showing we could achieve 80% of metrics in phase 1 while building toward full automation.',
  'Both stakeholders agreed to the phased approach. We launched on time, hitting 78% of the PM''s target metrics in phase 1, and by week 10 we had full automation in place. The next quarter saw zero data quality incidents while processing 100M users. Both the PM and Tech Lead later cited this as an example of collaborative problem-solving.',
  5, 5, 5, 5, 5.0,
  'senior', true
);

-- 4. CONFLICT: Technical decision debate
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'conflict',
  'Describe a time when you had to resolve a technical disagreement between engineering teams',
  'At Microsoft, two engineering teams disagreed on API design for our authentication service. The Backend team advocated for REST (citing team expertise and existing infrastructure), while the Frontend team pushed for GraphQL (citing flexibility and reduced network calls). The debate stalled the project for 3 weeks. I organized a structured decision-making workshop where each team presented data: Backend showed REST could reuse 60% of existing auth middleware, Frontend demonstrated GraphQL would reduce API calls from 5 to 1 per page load. I created a scorecard evaluating both options across 6 dimensions: performance, maintainability, team expertise, time-to-market, scalability, and developer experience. The data showed GraphQL scored higher on 4/6 dimensions. I proposed implementing GraphQL with a Backend-owned BFF (Backend for Frontend) layer, letting Backend team own the graph schema design. This gave Frontend the GraphQL benefits while letting Backend leverage their expertise. Both teams agreed, we shipped 2 weeks later, and page load times improved by 35%.',
  'At Microsoft, Backend and Frontend teams disagreed on API design for our authentication service. Backend wanted REST (team expertise, existing infrastructure), Frontend wanted GraphQL (flexibility, fewer network calls). The disagreement stalled the project for 3 weeks.',
  'I needed to break the deadlock, make a data-driven decision that both teams would accept, and ensure we could ship without further delays while maintaining team morale.',
  'I organized a structured workshop where each team presented quantitative data on their preferred approach. I created a scorecard evaluating both options across 6 key dimensions: performance, maintainability, team expertise, time-to-market, scalability, and developer experience. When data showed GraphQL scored higher on 4/6 dimensions, I proposed a compromise: GraphQL with a Backend-owned BFF layer, allowing Backend to leverage their expertise while giving Frontend the benefits they needed.',
  'Both teams agreed to the hybrid approach. We shipped 2 weeks later (recovering from the 3-week delay). Page load times improved by 35%, API calls reduced from 5 to 1 per page, and the Backend team successfully owned the graph schema design. The Tech Director later used this as a case study for data-driven decision-making.',
  5, 5, 5, 5, 5.0,
  'senior', true
);

-- 5. FAILURE: Project setback
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'failure',
  'Tell me about a time you failed on a project and what you learned',
  'At Amazon, I was TPM for a machine learning recommendation engine that was supposed to increase conversion by 10%. We launched after 6 months of development, but conversion actually dropped by 2%. I had failed to establish proper A/B testing earlier - we only tested the full experience, not individual components. In the post-mortem, I discovered the ML model was great (12% lift), but the new UI was confusing users (-14% impact). I took full ownership of the failure in front of my VP and 50 stakeholders. I immediately halted the rollout, created a detailed test plan breaking features into 8 separate experiments, and established weekly metrics reviews. I personally led the redesign of the testing strategy, implementing feature flags for gradual rollout. We re-launched 8 weeks later with the ML model and a refined UI. This time we saw 15% conversion lift. I documented the lessons learned in a runbook that became required reading for all TPMs launching customer-facing features. The VP later promoted me, citing my ownership and learning from failure.',
  'At Amazon, I was TPM for a machine learning recommendation engine expected to increase conversion by 10%. After 6 months of development, we launched and conversion actually dropped by 2% instead of increasing.',
  'I needed to understand why the launch failed, take ownership of the mistake, fix the problem quickly, and ensure this type of failure didn''t happen again across the organization.',
  'I immediately halted the rollout and conducted a thorough post-mortem, discovering we had only tested the full experience, not individual components. The ML model was actually strong (+12% lift) but the new UI was confusing users (-14% impact). I took full ownership in front of my VP and 50 stakeholders, created a detailed 8-part test plan, and personally led the redesign of our testing strategy with feature flags for gradual rollout.',
  'We re-launched 8 weeks later with the same ML model but a refined UI, achieving 15% conversion lift (exceeding original goals). I documented the lessons learned in a runbook that became required reading for all TPMs launching customer-facing features. The VP later cited my ownership and learning from failure as a key reason for my promotion.',
  5, 5, 5, 5, 5.0,
  'senior', true
);

-- 6. FAILURE: Missed deadline
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'failure',
  'Describe a time you missed a critical deadline and how you handled it',
  'At Google, I was TPM for a privacy compliance project with a legal deadline of March 1st (GDPR enforcement). We missed the deadline by 11 days due to my underestimating data migration complexity - I had allocated 3 weeks but it took 6 weeks. This exposed the company to potential regulatory fines. I immediately informed my director and legal team, taking full responsibility rather than blaming the engineering team. I created a crash plan: I personally joined the on-call rotation to unblock engineers 24/7, negotiated with legal to implement compensating controls (manual data deletion processes) while automation was being built, and brought in 3 contractors to accelerate the work. I also created a detailed post-mortem analyzing my estimation errors and implemented a new process requiring TPMs to get technical validation on all timeline estimates over 2 weeks. We completed the migration on March 12th, legal confirmed no fines were incurred due to the compensating controls, and the new estimation process reduced project delays by 40% across my org over the next year. My director appreciated my transparency and proactive resolution.',
  'At Google, I was TPM for a GDPR privacy compliance project with a legal deadline of March 1st. We missed the deadline by 11 days because I had underestimated data migration complexity (allocated 3 weeks, actually took 6 weeks), exposing the company to potential regulatory fines.',
  'I needed to immediately mitigate legal risk, complete the migration as quickly as possible, take responsibility for the miss, and implement processes to prevent future estimation failures.',
  'I immediately informed my director and legal team, taking full personal responsibility. I created a crash plan where I joined the on-call rotation 24/7 to unblock engineers, negotiated with legal to implement manual compensating controls while automation was being completed, and brought in 3 contractors to accelerate development. I also conducted a thorough post-mortem and implemented a new process requiring technical validation on all timeline estimates over 2 weeks.',
  'We completed the migration on March 12th. Legal confirmed no fines were incurred due to the compensating controls I had negotiated. The new estimation process I implemented reduced project delays by 40% across the organization over the next year. My director later praised my transparency and proactive approach to crisis management.',
  5, 5, 5, 5, 5.0,
  'senior', true
);

-- 7. PROGRAM SENSE: Complex program management
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'program_sense',
  'Tell me about the most complex program you managed and how you ensured its success',
  'At Meta, I managed the migration of 500 microservices from EC2 to Kubernetes, impacting 2000 engineers across 40 teams over 18 months. The complexity came from dependencies: 30% of services couldn''t migrate until their dependencies migrated first, creating a circular dependency problem. I built a dependency graph with 1200 edges, used topological sorting to identify migration order, and created a phased plan with 6 waves. I established a weekly steering committee with representatives from Infrastructure, Security, and Engineering leadership. For risk management, I required every team to complete a migration dry-run 2 weeks before their scheduled cutover. When the Security team discovered 12 services with hardcoded credentials during dry-runs, I paused wave 3, created a credentials rotation sprint, and added automated scanning to prevent future issues. I tracked progress with a live dashboard showing 47 metrics (services migrated, cost savings, incidents, rollback rate). We completed the migration 2 weeks early, achieved $12M annual cost savings, reduced deployment times by 60%, and had only 3 production incidents across 500 services (99.4% success rate).',
  'At Meta, I managed migrating 500 microservices from EC2 to Kubernetes over 18 months, impacting 2000 engineers across 40 teams. The challenge was 30% of services had circular dependencies, creating a complex migration sequencing problem.',
  'I needed to sequence 500 service migrations while resolving circular dependencies, coordinate 40 teams, manage risk across 18 months, and achieve cost and performance targets without major production incidents.',
  'I built a dependency graph with 1200 edges and used topological sorting to create a 6-wave migration plan. I established a weekly steering committee with cross-functional leadership, required dry-run migrations 2 weeks before cutover, and created a live dashboard tracking 47 metrics. When Security discovered hardcoded credentials during dry-runs, I paused wave 3, ran a credentials rotation sprint, and added automated scanning.',
  'We completed the migration 2 weeks early, achieved $12M annual cost savings, reduced deployment times by 60%, and had only 3 production incidents across 500 services (99.4% success rate). The dependency analysis framework I created became the standard for all large-scale migrations at Meta.',
  5, 5, 5, 5, 5.0,
  'senior', true
);

-- 8. PROGRAM SENSE: Prioritization
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'program_sense',
  'Describe how you prioritized work when you had competing high-priority initiatives',
  'At Amazon, I was TPM for both a Prime Day feature (hard deadline June 1st, $50M revenue impact) and a critical security vulnerability remediation (potential data breach, no firm deadline but high risk). Both teams wanted 100% of the same 8 engineers. I created a decision framework: I quantified financial risk ($50M revenue for Prime Day vs potential $200M+ in fines and reputational damage for security breach), assessed timeline flexibility (Prime Day was immovable, security could be partially mitigated with monitoring), and evaluated resource dependencies. I proposed a split: 5 engineers on Prime Day critical path (12 weeks), 3 engineers on security fixes (8 weeks). For the remaining security work, I negotiated to bring in a security consulting firm for $400K - expensive, but justified given the risk. I personally reviewed both projects daily to catch slippage early. Prime Day launched on time with all planned features, the critical security vulnerabilities were patched 5 days before our internal deadline, and my director praised the decision framework, which we then rolled out org-wide for prioritization decisions.',
  'At Amazon, I was TPM for both a Prime Day feature (hard deadline June 1st, $50M revenue impact) and a critical security vulnerability fix (potential data breach, high risk but no hard deadline). Both demanded the same 8 engineers full-time.',
  'I needed to prioritize between two high-stakes initiatives with competing resource demands, making a defensible decision that balanced business value and risk while ensuring both projects succeeded.',
  'I created a quantitative decision framework evaluating financial impact ($50M revenue vs $200M+ potential breach costs), timeline flexibility (Prime Day immovable vs security with partial mitigation options), and resource dependencies. I proposed allocating 5 engineers to Prime Day critical path and 3 to security, then negotiated $400K for a security consulting firm to cover remaining work. I personally reviewed both projects daily.',
  'Prime Day launched on time with all features, generating the targeted $50M revenue. Critical security vulnerabilities were patched 5 days ahead of our internal deadline with zero incidents. My director adopted the prioritization framework org-wide, and it became the standard for competing initiative decisions.',
  5, 5, 5, 5, 5.0,
  'senior', true
);

-- 9. TECHNICAL: System design decision
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'technical',
  'Tell me about a technical architecture decision you made and how you evaluated the tradeoffs',
  'At Google, I was TPM for a search indexing pipeline processing 100M documents/day. We needed to choose between: (A) Kafka + Spark for streaming (real-time, complex operational overhead), or (B) BigQuery + batch processing (4-hour latency, simpler ops). I created a technical evaluation framework: I ran load tests showing Kafka could handle 2M events/sec with 50ms p99 latency, while BigQuery batch had 3-hour processing time but $40K less monthly cost. I facilitated architecture reviews with 3 senior engineers, analyzed existing team expertise (we had 2 Spark experts but 8 BigQuery experts), and assessed business requirements (product said "within 6 hours" was acceptable, not truly real-time). The tradeoff analysis showed: streaming was technically superior but would require hiring 2 SREs ($400K annually) and 6 months to build, while batch met requirements with existing team in 6 weeks. I recommended batch processing with a future option to upgrade if business needs changed. We shipped in 7 weeks, stayed within budget, and after 8 months of operation, product confirmed the 4-hour latency was actually better than needed. We avoided $800K in annual costs (2 SREs + infrastructure) while meeting all business requirements.',
  'At Google, I was TPM for a search indexing pipeline processing 100M documents/day. We had to choose between Kafka+Spark streaming (real-time but complex) and BigQuery batch processing (4-hour latency but simpler operations).',
  'I needed to make a defensible technical architecture decision that balanced performance requirements, operational complexity, team expertise, cost, and time-to-market.',
  'I created a technical evaluation framework and ran comparative load tests. I facilitated architecture reviews with 3 senior engineers, analyzed team expertise (2 Spark experts vs 8 BigQuery experts), and validated business requirements (product needed "within 6 hours", not true real-time). The analysis showed streaming required hiring 2 SREs ($400K annually) and 6 months build time, while batch met requirements with existing team in 6 weeks.',
  'I recommended batch processing. We shipped in 7 weeks within budget. After 8 months of operation, product confirmed the 4-hour latency exceeded their needs. We avoided $800K in annual costs (2 SREs + infrastructure) while fully meeting business requirements. The evaluation framework became our standard for build-vs-buy decisions.',
  5, 5, 5, 5, 5.0,
  'senior', true
);

-- 10. TECHNICAL: Technical debt
INSERT INTO sample_answers (
  question_type, question_text, answer_text,
  situation_text, task_text, action_text, result_text,
  situation_score, task_score, action_score, result_score, overall_score,
  level, is_good_example
) VALUES (
  'technical',
  'Describe how you've addressed technical debt while balancing feature development',
  'At Microsoft, our codebase had 15-year-old monolithic payment processing code causing 40% of production incidents and slowing feature velocity by 3x (simple features took 6 weeks instead of 2). Product leadership resisted tech debt work, saying "customers don''t see refactoring." I quantified the problem: I calculated the monolith caused $2.1M annually in opportunity cost (slower features) plus $800K in incident response time. I proposed the "20% rule": allocate 1 week per sprint (20% of capacity) to technical debt, prioritized by incident impact. I created a tech debt backlog scored by: incident frequency, blast radius, and feature velocity impact. To get buy-in, I committed to tracking feature velocity and incident rates weekly. Over 6 months, we refactored the payment processing into 8 microservices (1 service per sprint, maintaining feature delivery). Feature velocity increased 2.1x (from 6 weeks to 2.8 weeks average), production incidents from the payment system dropped 78% (from 40 incidents/quarter to 9), and customer satisfaction scores improved by 12 points. Product leadership became advocates of the 20% rule, which was then adopted across the entire Azure org.',
  'At Microsoft, our 15-year-old monolithic payment processing code caused 40% of production incidents and made feature development 3x slower (6 weeks instead of 2 weeks for simple features). Product leadership resisted technical debt work.',
  'I needed to address critical technical debt that was impacting both reliability and feature velocity, while maintaining feature delivery commitments and gaining buy-in from resistant product leadership.',
  'I quantified the problem at $2.1M annual opportunity cost plus $800K in incident response. I proposed the "20% rule" (1 week per sprint for tech debt), created a prioritized backlog scored by incident frequency and feature impact, and committed to tracking metrics weekly. Over 6 months, we refactored the monolith into 8 microservices while maintaining feature delivery.',
  'Feature velocity increased 2.1x (6 weeks → 2.8 weeks average). Production incidents dropped 78% (40/quarter → 9/quarter). Customer satisfaction improved by 12 points. Product leadership became advocates, and the 20% rule was adopted across the entire Azure organization, becoming standard practice for balancing tech debt and features.',
  5, 5, 5, 5, 5.0,
  'senior', true
);