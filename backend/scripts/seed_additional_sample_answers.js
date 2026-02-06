const { Pool } = require('pg');
require('dotenv').config();

async function seedAdditionalSamples() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com') 
      ? { rejectUnauthorized: false } 
      : false
  });
  
  try {
    console.log('🌱 Seeding 10 additional sample answers...\n');
    
    // Get category IDs
    const categoriesResult = await pool.query('SELECT id, name FROM categories ORDER BY id');
    const categoryMap = {};
    categoriesResult.rows.forEach(cat => {
      categoryMap[cat.name] = cat.id;
    });

    const additionalSamples = [
      // =============================================
      // PROGRAM SENSE - Sample 2: Scope Management
      // =============================================
      {
        category_id: categoryMap['Program Sense'],
        question_type: '',
        question_text: 'You need to ship a product in 3 months but your eng team says they need 6 months. How do you handle this?',
        answer_text: 'I encountered this situation when leading a mobile app rewrite at a fintech startup. The engineering team estimated 6 months for a complete rebuild, but our executive team committed to investors for a 3-month beta launch. I first organized a technical deep-dive with the engineering leads to understand the 6-month estimate breakdown. They outlined 12 major features, each requiring 2-3 weeks of development plus testing. I then facilitated a prioritization workshop with product, engineering, and business stakeholders. We used a RICE framework (Reach, Impact, Confidence, Effort) to score all 12 features. This revealed that 5 core features would deliver 80% of the customer value. I proposed a phased approach: ship those 5 features in 3 months as "beta v1" to meet the commitment, then deliver remaining features in monthly releases over the next quarter. The key was getting alignment on success metrics—we defined beta success as 1,000 active users with 60% weekly retention, not feature completeness. I also negotiated for one additional senior engineer and accepted technical debt in non-critical areas with a documented payback plan. We launched on time with the 5 core features, hit 1,200 beta users in week one, and achieved 65% retention. The phased approach actually improved our learning loop—we incorporated beta feedback into the remaining 7 features, ultimately building a better product than the original 12-feature spec. The executive team was pleased, engineering felt heard rather than pressured, and we delivered measurable customer value on schedule.',
        situation_text: 'Leading a mobile app rewrite at a fintech startup where engineering estimated 6 months but executives committed to a 3-month beta launch to investors.',
        task_text: 'Bridge the 3-month gap between engineering estimates and business commitments while maintaining team morale and delivering customer value.',
        action_text: 'Organized technical deep-dive with engineering to understand the 6-month breakdown, facilitated RICE prioritization workshop with cross-functional stakeholders to identify 5 core features delivering 80% value, proposed phased approach with beta v1 in 3 months followed by monthly releases, aligned on success metrics (1,000 users, 60% retention) rather than feature completeness, negotiated for additional senior engineer, and documented technical debt payback plan.',
        result_text: 'Launched on time with 5 core features, achieved 1,200 beta users in week one (20% above target), hit 65% weekly retention (above 60% goal), incorporated beta feedback into remaining features resulting in better product than original spec, maintained team morale by having engineering feel heard, and satisfied executive commitments.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'Fintech Startup (Series B)'
      },

      // =============================================
      // PROGRAM SENSE - Sample 3: Risk Management
      // =============================================
      {
        category_id: categoryMap['Program Sense'],
        question_type: '',
        question_text: 'Tell me about a time you drove a project, identified risks, and mitigated them throughout the program.',
        answer_text: 'I led a critical payment infrastructure migration affecting 50 million users across 12 countries. The project involved moving from a legacy monolith to a microservices architecture while maintaining 99.99% uptime SLA. Early in planning, I identified three major risk categories: technical (data consistency during migration), operational (24/7 transaction processing with zero downtime), and compliance (PCI-DSS requirements across multiple jurisdictions). I established a weekly risk review cadence with engineering, legal, and operations. For technical risk, I mandated a dual-write strategy where we wrote to both old and new systems for 4 weeks, with automated reconciliation checking 100% of transactions. We caught a data sync bug affecting 0.02% of transactions during this phase—before any user impact. For operational risk, I coordinated with 6 regional ops teams to create detailed rollback runbooks for each of 8 migration phases. We conducted 3 full disaster recovery drills, which revealed our rollback time estimate was optimistic by 40%. I extended our migration windows from 2 hours to 3.5 hours accordingly. For compliance risk, I brought legal and compliance teams into sprint planning 8 weeks before launch. They identified that our data retention policy needed updates in 4 countries. By catching this early, we avoided what would have been a 6-week launch delay. I maintained a live risk register tracking 47 risks, updating it in every sprint review. We migrated all 50 million users over 6 months with zero payment failures, zero SLA violations, and zero compliance issues. The early risk identification saved an estimated 3 months of potential delays and $2M in remediation costs.',
        situation_text: 'Led payment infrastructure migration for 50 million users across 12 countries, moving from legacy monolith to microservices while maintaining 99.99% uptime SLA.',
        task_text: 'Identify and mitigate technical, operational, and compliance risks across a complex multi-country migration with zero tolerance for payment failures or downtime.',
        action_text: 'Identified three major risk categories (technical, operational, compliance) early in planning, established weekly risk review cadence with cross-functional teams, implemented dual-write strategy with automated reconciliation catching 0.02% sync issues pre-launch, coordinated with 6 regional ops teams for rollback runbooks, conducted 3 disaster recovery drills revealing 40% optimistic estimates, adjusted migration windows from 2 to 3.5 hours, brought legal into sprint planning 8 weeks early catching data retention issues in 4 countries, and maintained live risk register with 47 tracked risks updated every sprint.',
        result_text: 'Migrated 50 million users over 6 months with zero payment failures, zero SLA violations, and zero compliance issues. Early risk identification saved estimated 3 months of delays and $2M in remediation costs. Dual-write strategy caught critical sync bug before user impact.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'Payment Platform (Public Company)'
      },

      // =============================================
      // SYSTEM DESIGN - Sample 2: Scalability
      // =============================================
      {
        category_id: categoryMap['System Design'],
        question_type: '',
        question_text: 'Design a system to handle 10x growth in traffic over the next 6 months.',
        answer_text: 'When our video streaming platform planned to expand from 5 million to 50 million monthly users, I led the scalability design working with infrastructure and backend teams. I started with a capacity planning exercise, analyzing current resource utilization across our stack. Our monolithic Rails API was already at 70% CPU during peak hours with only 5M users—clearly a bottleneck. I proposed a three-phase architecture evolution. Phase 1 (Month 1-2): Horizontal scaling and caching. We moved our API to containerized services on Kubernetes with auto-scaling (5-50 pods based on CPU), implemented Redis caching for our most-hit endpoints (reducing DB load by 60%), and deployed a CDN for static assets (offloading 40% of origin traffic). Phase 2 (Month 3-4): Database optimization and sharding. We identified our user_videos table had grown to 200M rows, causing query times over 2 seconds. I worked with the DB team to implement horizontal sharding by user_id across 8 database clusters, reducing query times to under 100ms. We also separated read replicas from write masters at a 5:1 ratio. Phase 3 (Month 5-6): Service decomposition for highest-load components. We extracted our video transcoding service into a separate microservice with dedicated infrastructure, as it consumed 80% of our compute resources. This allowed independent scaling of transcoding workers (10-500 instances) based on queue depth. Throughout execution, I established SLI/SLO monitoring: p95 API latency under 200ms, video start time under 3 seconds, and 99.9% uptime. We load-tested each phase at 15x projected peak traffic. When we hit 50M users in month 7 (ahead of schedule), our p95 latency was 180ms (better than the 250ms at 5M users), video start time averaged 2.1 seconds, and we maintained 99.95% uptime. Infrastructure costs per user decreased by 30% due to efficient caching and resource utilization.',
        situation_text: 'Video streaming platform planning to scale from 5 million to 50 million monthly users in 6 months, with monolithic Rails API already at 70% CPU during peak hours.',
        task_text: 'Design and execute a scalable architecture to handle 10x user growth while maintaining performance SLAs and controlling infrastructure costs.',
        action_text: 'Conducted capacity planning analyzing current resource utilization, proposed three-phase evolution: (1) horizontal scaling with Kubernetes auto-scaling, Redis caching reducing DB load 60%, CDN offloading 40% traffic; (2) database sharding by user_id across 8 clusters reducing query times from 2s to under 100ms, 5:1 read/write replica ratio; (3) extracted video transcoding into independent microservice with 10-500 auto-scaling workers. Established SLI/SLO monitoring (p95 latency <200ms, video start <3s, 99.9% uptime) and load-tested each phase at 15x projected peak.',
        result_text: 'Successfully handled 50M users (reached month 7, ahead of schedule) with p95 latency improved to 180ms from 250ms baseline, video start time 2.1s average, 99.95% uptime achieved. Infrastructure cost per user decreased 30% through efficient caching and resource utilization.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'Video Streaming Platform (Series C)'
      },

      // =============================================
      // SYSTEM DESIGN - Sample 3: Reliability
      // =============================================
      {
        category_id: categoryMap['System Design'],
        question_type: '',
        question_text: 'How would you improve system reliability from 99.5% to 99.9% uptime?',
        answer_text: 'Our e-commerce checkout service was at 99.5% uptime (43 hours downtime annually), missing our 99.9% SLA (8.7 hours annually). As TPM, I led a reliability improvement initiative spanning infrastructure, monitoring, and incident response. First, I conducted a 6-month incident post-mortem analysis. I found 65% of downtime came from three root causes: database connection pool exhaustion (28 hours), cascading failures from dependent services (14 hours), and deployment-related issues (7 hours). For database reliability, I worked with infrastructure to implement connection pool monitoring with automated scaling, deployed circuit breakers on all database calls with 500ms timeout and exponential backoff, and set up read replicas with automatic failover (tested monthly). This reduced DB-related incidents by 85%. For service dependencies, I championed a "defense in depth" approach. We implemented bulkhead patterns isolating critical checkout flow from non-critical features, added request hedging where we send duplicate requests to backup services after 100ms, and created degraded mode operations—for example, checkout could complete even if recommendation service was down. I also established an SLO error budget framework, allocating our 0.1% error budget (43 minutes monthly) across services. Teams got alerted at 50% budget burn rate, forcing proactive fixes before SLA breach. For deployments, I introduced phased rollouts with automated canary analysis. We deployed to 1% traffic for 15 minutes with automated rollback on error rate increases >0.5%. This caught 4 major bugs before full deployment. I created a comprehensive monitoring dashboard tracking our "Four Golden Signals": latency (p50/p95/p99), traffic, errors, and saturation. We went from 2-hour mean time to detection (MTTD) to 8 minutes. After 6 months, we achieved 99.93% uptime (6 hours downtime annually), exceeding our 99.9% target. Customer trust increased—cart abandonment during checkout decreased from 23% to 18%.',
        situation_text: 'E-commerce checkout service at 99.5% uptime (43 hours annual downtime), missing 99.9% SLA requirement (8.7 hours allowed).',
        task_text: 'Improve system reliability from 99.5% to 99.9% uptime by addressing root causes of downtime and implementing proactive monitoring and incident prevention.',
        action_text: 'Analyzed 6-month incident history identifying three main causes: DB connection pool exhaustion (28h), cascading failures (14h), deployment issues (7h). Implemented DB connection pool auto-scaling, circuit breakers with 500ms timeout, read replicas with monthly-tested failover (reduced DB incidents 85%). Applied bulkhead patterns, request hedging after 100ms, and degraded mode operations. Established SLO error budget framework with 50% burn rate alerts. Introduced phased rollouts with 1% canary and automated rollback on >0.5% error increase. Created Four Golden Signals dashboard reducing MTTD from 2 hours to 8 minutes.',
        result_text: 'Achieved 99.93% uptime after 6 months, exceeding 99.9% target (6 hours annual downtime vs 43 hours baseline). Customer cart abandonment during checkout decreased from 23% to 18%, indicating improved trust. Caught 4 major bugs in canary phase before full deployment.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'E-commerce Platform (Public Company)'
      },

      // =============================================
      // BEHAVIORAL - Sample 2: Conflict Resolution
      // =============================================
      {
        category_id: categoryMap['Behavioral'],
        question_type: '',
        question_text: 'Tell me about a time you resolved a conflict between two teams.',
        answer_text: 'During a major platform launch, our iOS and Android teams had a serious conflict about feature parity that threatened our go-live date. The iOS team had implemented a sophisticated gesture-based navigation system over 8 weeks, while the Android team built a simpler tab-based approach, citing platform conventions. Both teams felt the other was "wrong" and executive leadership was getting pulled into daily debates. As TPM, I was responsible for shipping both apps in sync for a unified launch. I started by meeting each team lead 1:1 to understand their positions without the other present. The iOS team felt Android was being "lazy" and hurting user experience consistency. The Android team felt iOS was ignoring platform best practices and Material Design guidelines, which would confuse Android users. Both had valid points grounded in platform expertise. I organized a joint session but structured it carefully: First 30 minutes was a demo session where each team showed their implementation to the other without interruption. Then I asked each team to articulate the other team\'s perspective (forced empathy). This revealed the real issue: both teams wanted the best user experience but disagreed on whether "consistency across platforms" or "platform-native experience" was more important. I then shared data: our user research showed 73% of our users only used one platform, not both. This reframed the debate. I proposed that we optimize for platform-native experience rather than cross-platform consistency. However, I negotiated a middle ground: core user flows (login, payment, profile) would be consistent, while platform-specific features could diverge where it improved UX. I created a decision matrix for future features to determine which category they fell into. Both teams agreed, and we documented the principle: "Platform native by default, consistent for critical flows." We shipped on time, and post-launch data showed 92% task completion rate on both platforms (vs 87% target). The teams now collaborate regularly and even share learnings across platforms.',
        situation_text: 'iOS and Android teams in conflict over feature parity approach during major platform launch—iOS built sophisticated gesture navigation over 8 weeks while Android used simpler tab-based approach following platform conventions. Conflict escalating to daily executive involvement.',
        task_text: 'Resolve team conflict and align on platform strategy to ship both apps in sync for unified launch date without compromising user experience or team morale.',
        action_text: 'Met each team lead 1:1 to understand positions separately. Organized structured joint session: 30-min uninterrupted demos from each team, asked teams to articulate each other\'s perspectives (forced empathy), shared user research showing 73% single-platform usage reframing the debate. Proposed "platform-native by default" approach with middle ground: consistent core flows (login, payment, profile), platform-specific features allowed for UX improvement. Created decision matrix for future features and documented principle.',
        result_text: 'Shipped both apps on time with 92% task completion rate on both platforms (exceeding 87% target). Teams now collaborate regularly sharing cross-platform learnings. Conflict resolution created reusable framework preventing future disputes.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'Consumer Tech (Public Company)'
      },

      // =============================================
      // BEHAVIORAL - Sample 3: Learning from Failure
      // =============================================
      {
        category_id: categoryMap['Behavioral'],
        question_type: '',
        question_text: 'Describe a situation where you have failed and what you learned from it.',
        answer_text: 'I led a data pipeline migration that initially failed spectacularly, resulting in 6 hours of analytics downtime and impacting 15 data science teams. We were migrating from a legacy Hadoop cluster to a modern cloud-based data warehouse to reduce costs by 40%. I planned a 4-week migration with testing in a staging environment. However, I made three critical mistakes. First, I underestimated data volume—our staging environment had 10% of production data, and I assumed linear scalability. In production, our ETL jobs that took 2 hours in staging took 35 hours in production, causing a massive backlog. Second, I didn\'t involve downstream consumers early enough. We migrated the infrastructure but 12 critical data science models had hardcoded references to old table schemas. I discovered this only on launch day when data scientists couldn\'t access their models. Third, I set an aggressive timeline to "prove" efficiency to leadership, which created pressure to skip important validation steps. When the migration broke production analytics, I had to make a difficult call: execute our rollback plan and admit failure to the VP of Engineering. The rollback took 6 hours, during which data science teams couldn\'t run experiments. I took full ownership in the post-mortem—didn\'t blame the team, didn\'t make excuses. I learned four critical lessons: One, staging must match production at scale. We rebuilt staging with 80% of production data. Two, stakeholder mapping needs to be exhaustive—I created a dependency matrix identifying all 47 downstream consumers before the retry. Three, communicate early about risks, not just when things break—I established weekly migration updates to all stakeholders. Four, timelines should be based on technical reality, not proving a point to leadership. We re-executed the migration 8 weeks later with a 6-week timeline. It succeeded with zero downtime, zero data loss, and achieved the 40% cost reduction target. More importantly, I gained credibility by owning the failure and executing the recovery flawlessly. That VP later told me my handling of the failure was what convinced him to promote me to Senior TPM.',
        situation_text: 'Led data pipeline migration from legacy Hadoop to cloud data warehouse targeting 40% cost reduction. Migration failed causing 6 hours analytics downtime affecting 15 data science teams.',
        task_text: 'Own the failure, execute rollback plan, conduct thorough post-mortem, and identify learnings to ensure successful re-execution while rebuilding stakeholder trust.',
        action_text: 'Executed 6-hour rollback plan to restore production analytics. Took full ownership in post-mortem without blame or excuses. Identified three failure causes: (1) staging had only 10% production data missing scalability issues, (2) missed 12 critical downstream dependencies with hardcoded schemas, (3) aggressive timeline skipped validation. Implemented four fixes: rebuilt staging with 80% production data, created dependency matrix for all 47 consumers, established weekly stakeholder updates, and set realistic 6-week timeline. Re-executed migration with comprehensive testing.',
        result_text: 'Successfully re-executed migration 8 weeks later with zero downtime, zero data loss, and achieved 40% cost reduction target. Gained credibility through failure ownership—VP cited failure handling as reason for Senior TPM promotion. Created reusable migration playbook preventing similar failures.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'Data Analytics Platform (Series D)'
      },

      // =============================================
      // TECHNICAL - Sample 2: Debugging
      // =============================================
      {
        category_id: categoryMap['Technical'],
        question_type: '',
        question_text: 'Describe a time when you debugged a critical production issue.',
        answer_text: 'Our mobile app was experiencing intermittent crashes affecting 8% of iOS users, but we couldn\'t reproduce it in testing or staging. User complaints were escalating, and our App Store rating dropped from 4.8 to 4.3 stars in two weeks. As TPM, I coordinated the debugging effort across mobile, backend, and infrastructure teams. I started by analyzing the crash patterns in our observability tools. The crashes only occurred on iOS 15+ devices during checkout, but not every time—success rate was 92%. This suggested a race condition or timing-dependent bug. I worked with the iOS team to add granular logging around the checkout flow, tracking every network request, UI state transition, and background thread operation with microsecond timestamps. We deployed this instrumentation to 10% of users (our canary group). Within 6 hours, we collected 200 crash reports with detailed traces. I used distributed tracing to correlate mobile logs with backend API logs. I discovered that 8% of checkout requests were taking >5 seconds on the backend (due to a slow payment gateway), and during this delay, users were tapping the "Pay" button multiple times (reasonable user behavior when an app feels frozen). This created concurrent payment requests that our backend accepted, but our iOS state machine wasn\'t designed to handle concurrent payment responses. The race condition caused a null pointer exception. The fix required changes in two places. On iOS, I worked with the team to implement request deduplication—disable the Pay button on first tap and show a loading indicator. On the backend, we added idempotency keys to prevent duplicate payment processing. I also addressed the root cause: the slow payment gateway. We implemented client-side timeout of 3 seconds with a retry, and server-side request hedging to a backup payment processor if primary didn\'t respond in 2 seconds. We deployed the fix to 10% canary first, monitoring for 48 hours with zero crashes. Full rollout reduced crash rate from 8% to 0.02% (only edge cases on extremely slow networks). App Store rating recovered to 4.7 within a month. Total debugging time: 3 days from escalation to resolution.',
        situation_text: 'Mobile app experiencing intermittent crashes affecting 8% of iOS users during checkout, not reproducible in testing. App Store rating dropped from 4.8 to 4.3 stars in two weeks due to user complaints.',
        task_text: 'Debug production-only intermittent crash, coordinate cross-team investigation, identify root cause, implement fix, and restore app stability and user trust.',
        action_text: 'Analyzed crash patterns showing iOS 15+ devices, 92% success rate suggesting race condition. Added granular microsecond-level logging to checkout flow, deployed instrumentation to 10% canary collecting 200 crash reports. Used distributed tracing correlating mobile and backend logs, discovered 8% of requests taking >5s causing users to tap Pay button multiple times creating concurrent payment requests. iOS state machine couldn\'t handle concurrent responses causing null pointer exception. Implemented two-part fix: iOS request deduplication with loading indicator, backend idempotency keys. Addressed root cause with 3s client timeout and server-side request hedging to backup payment processor.',
        result_text: 'Reduced crash rate from 8% to 0.02% after full rollout. App Store rating recovered from 4.3 to 4.7 within one month. Total debugging time 3 days from escalation to production fix. Created reusable debugging playbook for production-only issues.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'Mobile Commerce (Public Company)'
      },

      // =============================================
      // TECHNICAL - Sample 3: Performance Optimization
      // =============================================
      {
        category_id: categoryMap['Technical'],
        question_type: '',
        question_text: 'Tell me about a time you optimized system performance.',
        answer_text: 'Our search service was experiencing severe performance degradation—p95 query latency had grown from 200ms to 3.5 seconds over 6 months as our product catalog grew from 1M to 10M items. This was causing 15% search abandonment and directly impacting revenue. As TPM, I led a performance optimization initiative with the search and infrastructure teams. I started with comprehensive profiling using distributed tracing and flame graphs. I identified three bottlenecks: First, our Elasticsearch queries were doing full-text search across all 10M documents for every query (O(n) complexity). Second, we were loading entire product objects (averaging 50KB each) into memory before filtering. Third, our search ranking algorithm ran a complex ML model for all results before pagination. I proposed a multi-phase optimization strategy. Phase 1 was query optimization. We implemented search index partitioning by product category, reducing search space by 80% for category-specific queries. We also added a query cache with 15-minute TTL for popular searches (captured 60% of traffic). This alone reduced p95 latency to 1.2 seconds. Phase 2 was data access optimization. Instead of loading full product objects, we created a lightweight search index with just the fields needed for filtering and ranking (product_id, price, category, rating). This reduced memory usage by 90% and improved query time by implementing pagination at the database level rather than in application memory. p95 latency dropped to 450ms. Phase 3 was algorithmic optimization. Our ML ranking model was O(n²) complexity. I worked with the ML team to create a two-stage ranking: a fast heuristic filter (price, rating, availability) that narrowed results to top 100, then applied the expensive ML model only to those 100 items instead of all matches. We A/B tested this and found no measurable difference in click-through rate, but reduced ranking computation time by 95%. Final p95 latency: 180ms, better than our original 200ms despite 10x data growth. Search abandonment dropped from 15% to 6%, contributing to a 12% increase in search-driven revenue. Infrastructure costs decreased 40% due to reduced CPU and memory usage.',
        situation_text: 'Search service p95 latency degraded from 200ms to 3.5s as product catalog grew from 1M to 10M items over 6 months, causing 15% search abandonment and revenue impact.',
        task_text: 'Optimize search performance to handle 10x data growth, reduce latency below original 200ms baseline, decrease abandonment rate, and reduce infrastructure costs.',
        action_text: 'Profiled system with distributed tracing and flame graphs identifying three bottlenecks: O(n) full-text search across 10M docs, loading 50KB product objects before filtering, running complex ML model on all results pre-pagination. Implemented three-phase optimization: (1) search index partitioning by category reducing search space 80%, query cache with 15min TTL capturing 60% traffic (reduced to 1.2s); (2) lightweight search index with only filter fields reducing memory 90%, DB-level pagination (reduced to 450ms); (3) two-stage ranking with fast heuristic filter to top 100 then ML model only on those, reducing computation 95% with no CTR impact.',
        result_text: 'Final p95 latency 180ms (better than 200ms baseline despite 10x data). Search abandonment dropped from 15% to 6%. Search-driven revenue increased 12%. Infrastructure costs decreased 40% through reduced CPU and memory usage.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'E-commerce Marketplace (Public Company)'
      },

      // =============================================
      // PARTNERSHIP - Sample 2: Stakeholder Management
      // =============================================
      {
        category_id: categoryMap['Partnership'],
        question_type: '',
        question_text: 'Tell me about a time you had to manage multiple stakeholders with competing priorities.',
        answer_text: 'I led a platform API redesign that had 8 distinct stakeholder groups with conflicting requirements: internal product teams wanted more features, external developers wanted backward compatibility, security wanted stricter auth, legal wanted GDPR compliance, infrastructure wanted to reduce costs, sales wanted faster partnership integrations, support wanted better error messages, and engineering wanted to reduce technical debt. Each group had valid needs, and satisfying one often meant disappointing another. As TPM, I needed to deliver a unified API strategy that balanced these competing priorities. I started by conducting individual stakeholder interviews to understand not just their requirements, but their underlying business objectives and constraints. I discovered that while everyone had different surface-level requests, there were three shared goals: reduce time-to-integrate for new partners (sales and dev experience), improve security posture (legal and security), and reduce operational costs (infrastructure and engineering). I created a stakeholder map showing decision authority, influence level, and interest areas for each group. This revealed that our VP of Engineering and Head of Partnerships were the ultimate decision-makers, while others were important influencers. I proposed a phased API evolution instead of a big-bang redesign. Phase 1 focused on security and compliance (satisfying legal and security), using OAuth 2.0 and implementing GDPR-compliant data handling. Phase 2 added new features for internal teams while maintaining backward compatibility through API versioning (v1 for existing partners, v2 for new features). Phase 3 optimized infrastructure costs by implementing rate limiting and caching. I established a monthly API governance council where all 8 stakeholder groups could raise concerns and vote on changes. For contentious decisions, I used data—for example, when product teams pushed for breaking changes, I showed that 73% of our API traffic came from 5 legacy partners who couldn\'t easily migrate. This convinced them to support versioning. The redesign shipped over 9 months across three phases. Partner integration time decreased from 6 weeks to 2 weeks (satisfying sales), security audit score improved from 72% to 94% (satisfying security and legal), infrastructure costs decreased 35% (satisfying infrastructure), and we maintained 100% backward compatibility (satisfying external developers). No stakeholder got everything they wanted, but every group achieved their top priority. The API governance council became a permanent fixture, now meeting quarterly.',
        situation_text: 'Led platform API redesign with 8 stakeholder groups having conflicting requirements: product teams wanted features, external devs wanted backward compatibility, security wanted stricter auth, legal wanted GDPR compliance, infrastructure wanted cost reduction, sales wanted faster partnerships, support wanted better errors, engineering wanted reduced technical debt.',
        task_text: 'Balance competing stakeholder priorities, deliver unified API strategy that addresses core business objectives, and maintain positive relationships with all 8 groups while making difficult trade-off decisions.',
        action_text: 'Conducted individual stakeholder interviews uncovering three shared goals: faster partner integration, improved security posture, reduced operational costs. Created stakeholder map showing decision authority (VP Eng, Head of Partnerships as ultimate decision-makers). Proposed phased evolution: Phase 1 security/compliance (OAuth 2.0, GDPR), Phase 2 new features with v1/v2 versioning for backward compatibility, Phase 3 cost optimization (rate limiting, caching). Established monthly API governance council for all 8 groups. Used data to resolve contentious decisions (showed 73% traffic from 5 legacy partners convincing product teams to support versioning).',
        result_text: 'Shipped 9-month phased redesign achieving: partner integration time reduced from 6 weeks to 2 weeks, security audit score improved from 72% to 94%, infrastructure costs decreased 35%, maintained 100% backward compatibility. Every stakeholder group achieved their top priority. API governance council became permanent quarterly fixture.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'Platform Company (Series D)'
      },

      // =============================================
      // PARTNERSHIP - Sample 3: Cross-functional Alignment
      // =============================================
      {
        category_id: categoryMap['Partnership'],
        question_type: '',
        question_text: 'Describe how you aligned multiple teams on a shared goal.',
        answer_text: 'Our company set an aggressive goal to launch in 3 new international markets (Japan, Germany, Brazil) within 6 months to hit our Series C growth targets. This required alignment across 7 teams: Product, Engineering, Marketing, Legal, Ops, Sales, and Finance. Initially, teams were misaligned—Engineering wanted to build one generic international solution over 12 months, Marketing wanted market-specific features for each country, Legal was focused on compliance timelines that didn\'t match the 6-month deadline, and Finance was concerned about the $3M budget. As TPM, I was tasked with getting all 7 teams rowing in the same direction to hit the launch deadline. I started by establishing a shared definition of success that all teams could rally behind. Instead of "launch in 3 markets," I defined success metrics: 10,000 paying users per market within 3 months of launch, <5% churn rate, and full regulatory compliance. This shifted the conversation from features to outcomes. I organized a 2-day kickoff workshop bringing all 7 team leads together. Day 1 was problem framing: each team presented their constraints, dependencies, and non-negotiables. This revealed critical insights—for example, Legal needed 4 months for Germany\'s data privacy review, which would miss our deadline if we didn\'t start immediately. Day 2 was solution design: we whiteboarded a phased launch strategy. Launch Japan first (fewest legal hurdles, 2-month timeline), then Germany (parallel legal track, 4-month timeline), then Brazil (3-month timeline). This sequencing allowed us to hit the 6-month window for all three markets while respecting Legal\'s constraints. For the Engineering vs. Marketing tension, I facilitated a prioritization session using Kano analysis. We categorized features into Must-Have (payment localization, language support), Performance (faster checkout), and Delighter (market-specific content). Engineering built Must-Haves generically (saving 4 months of dev time), while Marketing customized Delighters per market post-launch. I established a weekly cross-functional standup with clear DRI (Directly Responsible Individual) assignments for each workstream: Product owned user research, Engineering owned technical implementation, Legal owned compliance, Marketing owned go-to-market, etc. This eliminated the "not my job" problem. I also created a shared Slack channel and live dashboard showing progress against our success metrics across all three markets. When Germany\'s data privacy review was delayed by 3 weeks, I proactively convened Legal, Product, and Engineering to design a workaround: we launched with a data residency solution that satisfied interim requirements while the full review completed post-launch. We launched all three markets within 6 months. Japan hit 12,000 users (20% above target), Germany hit 9,500 users (5% below target), Brazil hit 11,200 users. Combined churn rate was 4.2% (beat the 5% target). The cross-functional team dynamic was so successful that we formalized it into a "Market Expansion Playbook" now used for all new market launches.',
        situation_text: 'Company goal to launch in 3 international markets (Japan, Germany, Brazil) in 6 months for Series C growth targets. Required alignment across 7 misaligned teams: Product, Engineering, Marketing, Legal, Ops, Sales, Finance. Engineering wanted 12-month generic solution, Marketing wanted market-specific features, Legal had compliance timelines conflicting with deadline, Finance concerned about $3M budget.',
        task_text: 'Align 7 cross-functional teams on shared goal, resolve conflicting priorities and timelines, establish clear ownership and accountability, and deliver successful multi-market launch within 6-month deadline and budget.',
        action_text: 'Defined shared success metrics: 10,000 paying users per market, <5% churn, full compliance (shifted conversation from features to outcomes). Organized 2-day kickoff: Day 1 problem framing revealing Legal needed 4-month Germany review, Day 2 solution design creating phased launch (Japan 2mo, Germany 4mo parallel, Brazil 3mo). Facilitated Kano analysis categorizing features: Must-Have built generically saving 4 months, Delighters customized per market post-launch. Established weekly cross-functional standup with clear DRI per workstream, shared Slack channel, live progress dashboard. When Germany privacy review delayed 3 weeks, proactively designed data residency workaround satisfying interim requirements.',
        result_text: 'Launched all 3 markets within 6 months. Japan achieved 12,000 users (20% above target), Germany 9,500 users (5% below), Brazil 11,200 users. Combined 4.2% churn rate (beat 5% target). Cross-functional collaboration formalized into "Market Expansion Playbook" for future launches.',
        overall_score: 5.0,
        situation_score: 5,
        task_score: 5,
        action_score: 5,
        result_score: 5,
        level: 'Senior TPM',
        company: 'SaaS Platform (Series C)'
      }
    ];

    console.log(`📝 Inserting ${additionalSamples.length} additional sample answers...\n`);

    let insertedCount = 0;
    for (const sample of additionalSamples) {
      await pool.query(`
        INSERT INTO sample_answers (
          category_id,
          question_type,
          question_text,
          answer_text,
          situation_text,
          task_text,
          action_text,
          result_text,
          overall_score,
          situation_score,
          task_score,
          action_score,
          result_score,
          level,
          company
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        sample.category_id,
        sample.question_type,
        sample.question_text,
        sample.answer_text,
        sample.situation_text,
        sample.task_text,
        sample.action_text,
        sample.result_text,
        sample.overall_score,
        sample.situation_score,
        sample.task_score,
        sample.action_score,
        sample.result_score,
        sample.level,
        sample.company
      ]);
      
      insertedCount++;
      console.log(`✅ Inserted sample ${insertedCount}/${additionalSamples.length}: ${sample.question_text.substring(0, 60)}...`);
    }

    // Verify
    const verifyResult = await pool.query(`
      SELECT c.name as category, COUNT(*) as sample_count
      FROM sample_answers sa
      JOIN categories c ON c.id = sa.category_id
      GROUP BY c.name
      ORDER BY c.name
    `);

    console.log(`\n📊 Sample Answers Summary:`);
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.category}: ${row.sample_count} samples`);
    });
    
    console.log(`\n✅ Successfully seeded ${insertedCount} additional sample answers!`);
    console.log(`\n⚠️  NEXT STEP: Run update_and_reembed_samples.js to add these to Pinecone!`);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Export for reuse OR run directly
if (require.main === module) {
  seedAdditionalSamples();
} else {
  module.exports = seedAdditionalSamples;
}