const { Pool } = require('pg');
require('dotenv').config();

async function seedProductionAnswers() {
  // ✅ Production-safe SSL configuration
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('render.com')
      ? { rejectUnauthorized: true }  // Render production
      : false  // Local development
  });
  
  try {
    console.log('🌱 Seeding 10 High-Caliber STAR Benchmarks...');
    
    const categoriesResult = await pool.query('SELECT id, name FROM categories');
    const categoryMap = {};
    categoriesResult.rows.forEach(cat => categoryMap[cat.name] = cat.id);

    const idealAnswers = [
      // =============================================
      // 1. PROGRAM SENSE
      // =============================================
      {
        category_name: 'Program Sense',
        question_text: 'How would you lead a project to migrate from one cloud provider to another?',
        answer_text: `I led a mission-critical cloud migration that had been stalled for 18 months, burning $1.2M monthly—40% over budget. [Situation] My mandate was to migrate 200 microservices and 50M users to a multi-cloud architecture within 12 months with zero downtime. [Task] I launched a 2-week pilot for a transcoding service burning $2M/year. I committed that if the pilot didn't hit 30% savings, I'd halt the program. When an outage hit GCP mid-project, I pivoted the team to a dual-cloud failover architecture to ensure integrity. [Action] We finished in 11 months, saved $4.2M in year one, and reduced P0 incidents by 60%. My dual-cloud framework was adopted by 8 product teams. [Result]`,
        competency_scores: { "Program Kickoff": 5, "Risk Mitigation": 5, "Execution": 5, "Strategic Influence": 5 }
      },
      {
        category_name: 'Program Sense',
        question_text: "You join a project that is 25% complete but has used 85% of resources. What are your next steps?",
        answer_text: `I joined a $5M enterprise security initiative that was 25% complete but had exhausted $4.2M of its budget due to severe scope creep. [Situation] I needed to salvage a functional MVP to satisfy a $10M contract renewal while stopping the financial burn within 30 days. [Task] I conducted a 'Zero-Based Audit,' cutting 60% of non-critical features. I negotiated with the Engineering VP to reassign 4 senior devs and implemented a strict Change Control Board. [Action] We delivered the MVP 15% under the revised budget, securing the renewal. The 'Audit Framework' I created is now the mandatory standard for over-budget projects. [Result]`,
        competency_scores: { "Prioritization": 5, "Strategic Influence": 5, "Execution": 5, "Communication": 5 }
      },

      // =============================================
      // 2. SYSTEM DESIGN
      // =============================================
      {
        category_name: 'System Design',
        question_text: 'Design a photo sharing system for a travel application.',
        answer_text: `Our travel app saw 3-second load times for APAC users, causing a 15% drop-off for our 18M global users. [Situation] I had to design a system to reduce latency to <300ms while keeping infra costs under $100k and scaling to 100M+ photos. [Task] I proposed a multi-region S3 strategy with geo-replication. I drove a 'build vs buy' analysis for image transformation, saving $400k in engineering time and 6 months of roadmap. [Action] Latency dropped to 280ms (a 10x improvement). We launched in 10 weeks and the architecture has since scaled to 50M photos with zero redesign. [Result]`,
        competency_scores: { "Scalability": 5, "Trade-offs": 5, "Reliability": 5, "Components": 5 }
      },
      {
        category_name: 'System Design',
        question_text: 'How would you design an API gateway for a high-traffic e-commerce platform?',
        answer_text: `During a Black Friday peak, our legacy gateway spiked to 2-second latencies, threatening $10M in hourly revenue. [Situation] I needed to design a gateway capable of handling 500k requests/second with 99.99% availability. [Task] I implemented a decentralized Envoy-based service mesh with global rate-limiting. I made the trade-off to prioritize 'availability over consistency' during peak loads. [Action] The new system handled 650k RPS with <50ms latency. We achieved 100% uptime and reduced MTTR from 2 hours to 15 minutes by automating canary rollbacks. [Result]`,
        competency_scores: { "Reliability": 5, "Components": 5, "Data Flow": 5, "Scalability": 5 }
      },

      // =============================================
      // 3. BEHAVIORAL
      // =============================================
      {
        category_name: 'Behavioral',
        question_text: 'Tell me about a time you took a big risk and it failed. What did you learn?',
        answer_text: `To meet a $2M renewal deadline, I authorized a security patch release without the standard 24-hour soak period. [Situation] I had to balance platform integrity against a business milestone that funded two quarters of development. [Task] The release failed, causing a 2-hour API outage. I immediately owned the failure in a blameless post-mortem and designed an automated 'fail-safe' deployment gate. [Action] The new gate reduced deployment-related P0s by 90% over the year. We secured the $2M renewal by proving our commitment to long-term stability. [Result]`,
        competency_scores: { "Leadership": 5, "Ownership": 5, "Conflict Resolution": 5, "Adaptability": 5 }
      },
      {
        category_name: 'Behavioral',
        question_text: 'Tell me about a time you had a significant conflict with a senior stakeholder.',
        answer_text: `The Head of Sales demanded a custom feature for a $5M prospect that would have delayed our core engineering roadmap by 3 months. [Situation] I had to find a compromise that secured the revenue without derailing the 200-person engineering org. [Task] I held a data-driven workshop to map technical debt and proposed a phased MVP approach using existing APIs. This met 80% of the client's needs with only a 2-week delay. [Action] Sales closed the $5M deal and Engineering maintained its critical path. I established a 'Sales-Eng Intake Framework' that reduced similar conflicts by 50%. [Result]`,
        competency_scores: { "Conflict Resolution": 5, "Influence": 5, "Communication": 5, "Adaptability": 5 }
      },

      // =============================================
      // 4. TECHNICAL
      // =============================================
      {
        category_name: 'Technical',
        question_text: 'Describe a time you solved a complex technical problem that was blocking a program.',
        answer_text: `Our primary database hit 95% CPU utilization during peak traffic, causing 2-second latencies and threatening $8M in hourly revenue. [Situation] I had to identify a solution to stabilize the platform within 48 hours to survive the holiday season. [Task] I performed a query log audit and identified a 'thundering herd' problem. I worked with the infra team to implement Request Collapsing and a Redis-based circuit breaker. [Action] CPU utilization dropped to 35% within 4 hours. We handled 2x the previous year's peak traffic with <50ms latency, saving $4M in infrastructure costs. [Result]`,
        competency_scores: { "Problem Solving": 5, "Technical Depth": 5, "Complexity Analysis": 5, "Debugging": 5 }
      },
      {
        category_name: 'Technical',
        question_text: 'Tell me about a technical trade-off you made. Why did you make it?',
        answer_text: `We were building a real-time analytics engine for 10M global users. A 'Strongly Consistent' model was proposed, but it would have spiked APAC latency to 800ms. [Situation] I had to decide between data consistency and user experience (latency) to meet our <200ms global target. [Task] I advocated for an 'Eventual Consistency' model. I convinced stakeholders that for analytics, a 5-second freshness delay was acceptable for a 4x improvement in responsiveness. [Action] We achieved 180ms latency globally—a 4.5x improvement. User engagement in APAC increased by 22% and the architecture handled a 300% data spike without redesign. [Result]`,
        competency_scores: { "Problem Solving": 5, "Technical Depth": 5, "Code Quality": 5, "Complexity Analysis": 5 }
      },

      // =============================================
      // 5. PARTNERSHIP
      // =============================================
      {
        category_name: 'Partnership',
        question_text: 'How do you build trust with engineering teams when you lack authority over them?',
        answer_text: `I was tasked with implementing a mandatory security scanning gate across 50 independent engineering teams who viewed it as unnecessary overhead. [Situation] My goal was to achieve 100% adoption within 6 months without impacting developer velocity. [Task] I identified three 'influencer' teams and worked as a hands-on partner to integrate the gate into their CI/CD. I personally fixed 10+ false-positive bugs that were blocking them. [Action] We achieved 100% adoption in 5 months. The program resulted in a 70% decrease in critical security vulnerabilities, and my model was reused for 10+ other changes. [Result]`,
        competency_scores: { "Influence": 5, "Negotiation": 5, "Cross-functional Alignment": 5, "Stakeholder Management": 5 }
      },
      {
        category_name: 'Partnership',
        question_text: 'Tell me about a time you negotiated a complex partnership agreement.',
        answer_text: `Our platform required integration with 3 external map vendors, but initial licensing costs would have wiped out our product's margin. [Situation] I needed to negotiate a master agreement that reduced costs by 30% while improving our uptime SLAs. [Task] I developed a competitive bidding framework and leveraged 3-year growth projections for volume discounts. I negotiated a tiered pricing model that protected us during low-volume periods. [Action] We achieved a 30% cost reduction and a master agreement saving $2M annually. This framework was adopted by the global procurement team for all vendor partnerships. [Result]`,
        competency_scores: { "Negotiation": 5, "Communication": 5, "Cross-functional Alignment": 5, "Influence": 5 }
      }
    ];

    let inserted = 0;
    let skipped = 0;

    for (const answer of idealAnswers) {
      const categoryId = categoryMap[answer.category_name];
      
      if (!categoryId) {
        console.warn(`⚠️  Category "${answer.category_name}" not found, skipping...`);
        skipped++;
        continue;
      }
      
      // ✅ Parse using anchor tags
      const parts = answer.answer_text.split(/\[Situation\]|\[Task\]|\[Action\]|\[Result\]/).filter(p => p.trim());
      
      // ✅ Determine question type from category
      const questionType = answer.category_name.toLowerCase().replace(' ', '_');
      
      try {
        await pool.query(`
          INSERT INTO sample_answers (
            category_id, 
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
            company, 
            year_answered, 
            competency_scores,
            is_good_example,
            question_type,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `, [
          categoryId, 
          answer.question_text, 
          answer.answer_text,
          parts[0]?.trim() || '', 
          parts[1]?.trim() || '', 
          parts[2]?.trim() || '', 
          parts[3]?.trim() || '',
          5, // overall_score
          5, // situation_score
          5, // task_score
          5, // action_score
          5, // result_score
          'Senior TPM', 
          'Tech Giant', 
          2024, 
          JSON.stringify(answer.competency_scores),
          true, // ✅ is_good_example
          questionType, // ✅ question_type
          JSON.stringify({
            source: 'production_seed',
            seed_version: '1.0',
            verified: true,
            anchor_tags: true,
            quantified_metrics: true,
            i_statements: true
          })
        ]);
        
        inserted++;
        console.log(`✅ Inserted: ${answer.category_name} - ${answer.question_text.slice(0, 60)}...`);
        
      } catch (err) {
        console.error(`❌ Failed to insert: ${answer.question_text.slice(0, 60)}...`);
        console.error(`   Error: ${err.message}`);
        skipped++;
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('✅ SEEDING COMPLETE');
    console.log('='.repeat(70));
    console.log(`✅ Inserted: ${inserted}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`📊 Total: ${idealAnswers.length}`);
    console.log('='.repeat(70) + '\n');
    
  } catch (err) {
    console.error('❌ Fatal Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Execute
seedProductionAnswers().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});