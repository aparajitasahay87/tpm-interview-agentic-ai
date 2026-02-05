const { Pool } = require('pg');
require('dotenv').config();

async function seedSampleAnswers() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com') 
      ? { rejectUnauthorized: false } 
      : false
  });
  
  try {
    console.log('🌱 Seeding sample answers...\n');
    
    // Get category and question IDs
    const categoriesResult = await pool.query('SELECT id, name FROM categories ORDER BY id');
    const categoryMap = {};
    categoriesResult.rows.forEach(cat => {
      categoryMap[cat.name] = cat.id;
    });

    const questionsResult = await pool.query(`
      SELECT q.id, q.question_text, c.name as category_name
      FROM questions q
      JOIN categories c ON c.id = q.category_id
      ORDER BY c.name, q.id
    `);

    // =============================================
    // SAMPLE ANSWER 1: Program Sense - Cloud Migration
    // =============================================
    const answer1 = {
      category_name: 'Program Sense',
      question_text: 'How would you lead a project to migrate from one cloud provider to another?',
      answer_text: `I joined as the TPM lead for a cloud migration that had stalled for 18 months. Our infrastructure costs were burning $12M annually on AWS—40% above budget—but three previous attempts to migrate to GCP had failed due to stakeholder paralysis. Engineering didn't trust the timeline, Finance wouldn't fund it without guarantees, and our CEO was personally skeptical after the failed attempts.

My mandate was to either make it happen or kill the project permanently. With 200 microservices, 50M users across 12 countries, and $200M ARR at stake, failure meant layoffs.

Here's what I did differently. Instead of another big proposal, I built trust through proof. I identified our most expensive service—a video transcoding pipeline burning $2M/year—and proposed a 2-week pilot with one engineer. When Finance pushed back, I personally committed: if we didn't hit 30% cost reduction in the pilot, I'd recommend killing the entire migration.

The pilot worked—38% reduction. That unlocked $1.5M in funding.

But the real challenge came mid-project. Three months in, GCP had a 6-hour outage in EU-West, and our Head of Engineering wanted to halt everything. I had a choice: play it safe and pause, or bet my credibility. I convinced our CTO to continue by implementing a dual-cloud failover architecture I'd been developing in parallel—something neither AWS nor GCP customers typically do. It added 4 weeks but gave us leverage to negotiate better SLAs with both providers.

We completed the migration in 11 months, saved $4.2M in year one, reduced P0 incidents by 60% through better observability tooling in GCP, and the dual-cloud pattern I pioneered was adopted by 8 other product teams. Two engineers I mentored through this were promoted to senior roles.

What I learned: transformational programs don't fail due to technical challenges—they fail due to trust deficits. Starting with a small, high-conviction bet that I was willing to stake my reputation on changed the entire dynamic.`,
      company: 'Tech Startup (Series C)',
      level: 'Senior TPM',
      year_answered: 2024,
      overall_score: 5,
      situation_score: 5,
      task_score: 5,
      action_score: 5,
      result_score: 5,
      competency_scores: {
        'Program Kickoff': 5,
        'Risk Mitigation': 5,
        'Execution': 5,
        'Prioritization': 4,
        'Strategic Influence': 5,
        'Communication': 5
      }
    };

    // =============================================
    // SAMPLE ANSWER 2: System Design - Photo Sharing
    // =============================================
    const answer2 = {
      category_name: 'System Design',
      question_text: 'Design a photo sharing system for a travel application.',
      answer_text: `At my previous company, we were building a travel app and our CEO wanted Instagram-like photo sharing, but our existing architecture couldn't handle it. We had 5M users uploading an average of 3 photos per trip, and our VP of Engineering said we'd need to rebuild our entire backend—a 9-month project that would kill our roadmap.

My task was to design a scalable photo sharing system that could launch in 3 months without disrupting ongoing work, handling 15M photos in year one and scaling to 100M+ photos over 3 years.

The challenge was balancing cost, performance, and speed to market. I proposed a hybrid approach: use S3 for storage with CloudFront CDN for delivery, but here's the key decision—instead of building our own image processing pipeline, I evaluated three vendors and negotiated with Imgix for real-time image transformation. This was controversial—Engineering wanted to build it ourselves for "control," Finance worried about vendor lock-in costs.

I convinced them by running a 1-week prototype that processed 10,000 images. The data was clear: building in-house would cost $400K in eng time over 6 months, Imgix was $60K annually with 2-week integration. I also negotiated a 2-year price lock with an exit clause, addressing Finance's concern.

But the real complexity came with global distribution. Users in Southeast Asia were seeing 3-second load times. I worked with our infrastructure team to implement a multi-region S3 bucket strategy with automatic geo-replication and added a smart CDN routing layer that reduced latency from 3 seconds to 300ms in APAC—a 10x improvement.

We launched in 10 weeks instead of 9 months, processed 18M photos in year one (20% above projections), kept infrastructure costs under $100K annually, and the architecture scaled to 50M photos with zero redesign. The design pattern I created became our template for all media-heavy features.

What I learned: the best architecture isn't the most sophisticated—it's the one that ships fast, costs less, and scales when needed. Build vs buy is a false dichotomy; the real question is what creates the most value soonest.`,
      company: 'Travel Tech Company',
      level: 'TPM II',
      year_answered: 2024,
      overall_score: 5,
      situation_score: 5,
      task_score: 5,
      action_score: 5,
      result_score: 5,
      competency_scores: {
        'Scalability': 5,
        'Trade-offs': 5,
        'Components': 5,
        'Data Flow': 4,
        'Reliability': 5
      }
    };

    // =============================================
    // SAMPLE ANSWER 3: Behavioral - Risk and Failure
    // =============================================
    const answer3 = {
      category_name: 'Behavioral',
      question_text: 'Tell me about a time you took a big risk and it failed. What did you learn? What would you do differently?',
      answer_text: `Two years ago, I was leading the launch of a new enterprise feature that had $5M in pre-committed ARR from three Fortune 500 customers. We had a hard deadline—contracts required delivery by Q4 or we'd lose the revenue and face penalties.

Three weeks before launch, our QA team found a critical security vulnerability that would take 6 weeks to fix properly. I had a decision: delay the launch and lose $5M plus damage customer trust, or ship with a temporary mitigation and fix it post-launch.

I chose to ship. Here's my reasoning: the vulnerability required physical access to our data center to exploit—extremely low probability. I got Security to sign off on a 90-day remediation plan, added extra monitoring, and personally briefed all three customers on the risk and mitigation. Our CTO was skeptical but trusted my judgment.

We launched on time. Two weeks later, a security researcher found the vulnerability and published it on HackerNews before our 90-day window closed. Within 6 hours, two of our three enterprise customers put us on vendor review, our stock dropped 8%, and I was called into an emergency board meeting.

The failure was mine. I had underestimated reputational risk and overestimated my ability to control the narrative. Even though the actual security risk was low, the perception risk was catastrophic. We ended up losing one customer worth $1.8M, spending $400K on emergency remediation, and I had to rebuild trust with our CTO and board.

But here's what I did to recover: I personally led a 30-day security sprint, brought in external auditors, and implemented a new launch readiness framework that included a 'reputational risk' review with our comms team—something we'd never done before. I also took full accountability in the board meeting rather than deflecting to QA or Security.

Six months later, we won back the lost customer plus two new ones because they saw how seriously we took the failure. The launch framework I created prevented three similar situations in the following year, and our CTO later told me that my handling of the aftermath—not the initial decision—is what rebuilt his trust.

What I learned: senior leaders are judged not by avoiding failure, but by how they respond to it. Accountability, swift action, and systemic fixes matter more than being right. I also learned that probability risk and perception risk are different—I was optimizing for the former and ignoring the latter, which was naive.`,
      company: 'Enterprise SaaS',
      level: 'Senior TPM',
      year_answered: 2023,
      overall_score: 5,
      situation_score: 5,
      task_score: 5,
      action_score: 5,
      result_score: 5,
      competency_scores: {
        'Leadership': 5,
        'Conflict Resolution': 4,
        'Influence': 4,
        'Ownership': 5,
        'Communication': 5,
        'Adaptability': 5
      }
    };

    // =============================================
    // SAMPLE ANSWER 4: Technical - Bug Before Release
    // =============================================
    const answer4 = {
      category_name: 'Technical',
      question_text: 'You identify a new bug 2 days before the release of your new product feature. What do you do?',
      answer_text: `This happened to me last year during our biggest product launch of the year. We were releasing a new payment processing feature that had taken 6 months to build, with major press coverage scheduled and 50 sales demos booked for launch week.

Two days before release, our automation tests caught a race condition in the payment flow that could cause double-charging in 0.3% of transactions. Engineering estimated a proper fix would take 5 days—pushing us past launch.

The pressure was immense. Marketing had spent $200K on the launch campaign, Sales was furious at the delay, and our VP of Product wanted to ship with a known issue warning in the docs. But here's the thing: 0.3% of our projected 100K transactions in week one meant 300 customers potentially double-charged. Even with refunds, that's a customer trust and regulatory nightmare.

I made the call to delay. But I didn't just announce a delay—I got creative about recovery. I negotiated with Marketing to pivot the launch messaging from 'feature available now' to 'early access program' with a 2-week waitlist, which actually increased demand. I personally called our top 10 prospects to give them VIP early access once we fixed the bug, turning a negative into a relationship builder. And I worked with Engineering to parallelize the fix and regression testing, getting us to launch in 3 days instead of 5.

The political fallback was real. Our CMO was livid about the last-minute change, and I had to defend my decision in a tense exec meeting where people questioned my judgment. I held firm: we don't ship bugs that can cost customers money, period. Our CEO backed me, but I could tell I'd burned some trust with Marketing.

We launched 3 days late with the bug fixed, processed 120K transactions in week one (20% above forecast, partly due to the 'exclusivity' messaging), had zero payment issues, and the early access approach became our standard for future launches. Our CMO later admitted the 'waitlist' strategy drove higher engagement than a direct launch would have.

What I learned: the right decision often costs you political capital in the short term but builds institutional trust long term. Also, constraints breed creativity—having to delay forced us to find a better go-to-market approach. I learned to always ask: 'how can I turn this constraint into an advantage?' rather than just 'how do I minimize damage?'`,
      company: 'FinTech',
      level: 'TPM',
      year_answered: 2024,
      overall_score: 5,
      situation_score: 5,
      task_score: 5,
      action_score: 5,
      result_score: 5,
      competency_scores: {
        'Problem Solving': 5,
        'Code Quality': 5,
        'Complexity Analysis': 4,
        'Debugging': 5
      }
    };

    // =============================================
    // SAMPLE ANSWER 5: Partnership - Stakeholder Conflict
    // =============================================
    const answer5 = {
      category_name: 'Partnership',
      question_text: 'Sales thinks a new platform policy is too restrictive and stops revenue. Legal thinks it prevents lawsuits and negative PR. How would you handle this stakeholder conflict and drive alignment?',
      answer_text: `I faced exactly this situation last year. We were a B2B SaaS company, and Legal wanted to implement a strict data residency policy requiring all customer data to stay in their home country. This was driven by GDPR and emerging regulations. But Sales was furious—it meant we couldn't serve multinational clients with our current infrastructure, potentially costing us $10M in pipeline.

The conflict was brutal. In a meeting I facilitated, our Head of Sales literally said 'Legal is killing the company,' and our General Counsel responded 'Sales is going to get us sued into bankruptcy.' They both looked at me to pick a side.

I didn't pick a side. Instead, I reframed the problem. I asked both teams: 'What if we could satisfy the legal requirements AND keep the multinational deals?' Initially, both said impossible, but I pushed: 'What's the minimum viable compliance we need for Legal to sign off, and what's the minimum deal velocity Sales needs to hit their number?'

This led to a breakthrough. Legal didn't need full data residency immediately—they needed a 12-month roadmap to compliance with interim controls. Sales didn't need to serve all multinationals—they needed the top 5 accounts representing $6M of the $10M pipeline.

I proposed a three-tier approach: Tier 1 (US-only customers) - ship immediately with current architecture. Tier 2 (Top 5 multinational accounts) - manual data isolation process that Legal approved as interim, allowing Sales to close deals while we built the real solution. Tier 3 (Future multinationals) - 12-month engineering roadmap for full multi-region architecture.

But here's where it got hard. Engineering said Tier 2 would require 2 full-time engineers on manual work, pulling them from product roadmap. Finance said no to the headcount. I had to make a trade: I convinced our CPO to delay a lower-priority feature to free up the engineers, and I personally committed to Sales that if we didn't close 3 of the 5 target deals in 90 days, I'd recommend killing Tier 2 and they could blame me.

We closed 4 of the 5 deals worth $5.2M, Legal got their compliance roadmap approved by the board, and Engineering delivered the multi-region architecture in 11 months instead of 12. The interim manual process I designed became a consulting service we later sold to other companies facing the same problem, generating $800K in unexpected revenue.

What I learned: intractable stakeholder conflicts usually mean you're solving the wrong problem. When two smart teams are deadlocked, the issue isn't who's right—it's that the framing forces a false choice. My job as TPM is to find the third option that nobody saw because they were too busy fighting.`,
      company: 'B2B SaaS',
      level: 'Senior TPM',
      year_answered: 2023,
      overall_score: 5,
      situation_score: 5,
      task_score: 5,
      action_score: 5,
      result_score: 5,
      competency_scores: {
        'Influence': 5,
        'Negotiation': 5,
        'Communication': 5,
        'Cross-functional Alignment': 5,
        'Stakeholder Management': 5
      }
    };

    // Combine all answers
    const sampleAnswers = [answer1, answer2, answer3, answer4, answer5];

    console.log(`📊 Total sample answers to seed: ${sampleAnswers.length}\n`);

    // Find matching questions and insert
    let insertedCount = 0;
    for (const answer of sampleAnswers) {
      const categoryId = categoryMap[answer.category_name];
      
      // Find matching question
      const matchingQuestion = questionsResult.rows.find(q => 
        q.category_name === answer.category_name && 
        q.question_text.toLowerCase().includes(answer.question_text.toLowerCase().substring(0, 30))
      );

      if (!matchingQuestion) {
        console.log(`⚠️  No matching question found for: ${answer.question_text.substring(0, 50)}...`);
        console.log(`   Creating answer without question link`);
      }

      const questionId = matchingQuestion?.id || null;

      // Calculate STAR breakdown from answer text (simplified - just taking first sentences)
      const sentences = answer.answer_text.split('.').map(s => s.trim()).filter(s => s.length > 0);
      
      await pool.query(`
        INSERT INTO sample_answers (
          question_id,
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
          company,
          year_answered,
          competency_scores
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        questionId,
        categoryId,
        answer.category_name.toLowerCase().replace(/ /g, '_'),
        answer.question_text,
        answer.answer_text,
        sentences.slice(0, 2).join('. '),  // Situation
        sentences.slice(2, 4).join('. '),  // Task
        sentences.slice(4, -2).join('. '), // Action
        sentences.slice(-2).join('. '),    // Result
        answer.overall_score,
        answer.situation_score,
        answer.task_score,
        answer.action_score,
        answer.result_score,
        answer.level,
        answer.company,
        answer.year_answered,
        JSON.stringify(answer.competency_scores)
      ]);
      
      insertedCount++;
      console.log(`✅ ${answer.category_name}: ${answer.question_text.substring(0, 60)}...`);
    }

    // Verify
    const verifyResult = await pool.query(`
      SELECT c.name as category, COUNT(*) as answer_count
      FROM sample_answers sa
      JOIN categories c ON c.id = sa.category_id
      GROUP BY c.name
      ORDER BY c.name
    `);

    console.log(`\n📊 Sample Answers Summary:`);
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.category}: ${row.answer_count} answers`);
    });
    
    console.log(`\n✅ Successfully seeded ${insertedCount} sample answers!`);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedSampleAnswers();