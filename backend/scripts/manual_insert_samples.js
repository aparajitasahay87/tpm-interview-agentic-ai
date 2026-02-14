require('dotenv').config();
const db = require('../config/database');

async function manualInsert() {
  try {
    console.log('📝 Manually inserting Behavioral + Technical samples...\n');
    
    // Behavioral sample
    const behavioral = {
      category_id: 3,
      question_text: "Tell me about a time you had to resolve a conflict between team members.",
      answer_text: "At Google in Q3 2023, I was TPM for the Search Ads Platform serving 2M advertisers. Two senior engineers, Maria Chen (backend lead) and James Park (frontend lead), had a major disagreement about API design that blocked our Q4 launch affecting $50M revenue. Maria wanted REST APIs for simplicity, James insisted on GraphQL for flexibility. The conflict escalated—they stopped attending each other's meetings and their teams became siloed. I had 2 weeks to resolve this before our executive review. I scheduled separate 1:1s with both to understand their actual concerns. Maria feared GraphQL's learning curve would delay the launch. James worried REST would require multiple API calls hurting performance. I proposed a hybrid: REST for simple queries, GraphQL for complex ones. I showed data proving this approach would meet both the launch timeline AND performance targets. I facilitated a 2-hour working session where both leads collaboratively designed the hybrid API. I also established weekly architecture reviews to prevent future conflicts. We launched on time in October 2023, the hybrid API reduced API calls by 40%, and both Maria and James presented it together at our engineering all-hands. Their collaboration improved team velocity by 25%. I learned that most technical conflicts are really about fear and trust—addressing the emotions first unlocks the technical solution.",
      situation_text: "At Google in Q3 2023, TPM for Search Ads Platform serving 2M advertisers. Two senior engineers (Maria Chen, James Park) had major API design disagreement blocking Q4 launch affecting $50M revenue.",
      task_text: "Resolve conflict between senior engineers, unblock Q4 launch, maintain team collaboration, complete in 2 weeks before executive review.",
      action_text: "Scheduled separate 1:1s to understand concerns. Proposed hybrid approach (REST + GraphQL) with data proving it met both timeline and performance targets. Facilitated 2-hour collaborative design session. Established weekly architecture reviews.",
      result_text: "Launched on time October 2023. Hybrid API reduced API calls by 40%. Both engineers presented together at all-hands. Team velocity improved 25%.",
      situation_score: 5,
      task_score: 5,
      action_score: 5,
      result_score: 5,
      overall_score: 5.0,
      competency_scores: {
        "Leadership": 4,
        "Conflict Resolution": 4,
        "Influence": 3,
        "Ownership": 3,
        "Communication": 4,
        "Adaptability": 3
      },
      question_type: "behavioral",
      is_good_example: true
    };
    
    // Technical sample
    const technical = {
      category_id: 4,
      question_text: "Describe a time you had to debug a critical production issue.",
      answer_text: "At Stripe in January 2024, I was TPM for Payment Processing handling 5M daily transactions worth $200M. At 3 AM on a Saturday, our fraud detection system started rejecting 15% of legitimate transactions (normal: 0.5%), costing merchants $90K per hour. The on-call engineer debugged for 60 minutes with no progress and escalated to me. I had 4 hours before our VP would be paged. The system involved 8 microservices, 3 databases, and 2 ML models. I started with data, not code. I pulled error logs from Datadog and found a pattern: 92% of rejections were Visa cards in US-East region starting at 2:15 AM. This ruled out gradual issues like memory leaks and pointed to a discrete event. I formed three hypotheses: (1) Visa API change, (2) ML model deployment, (3) database lag. I checked deployment logs—no ML changes at 2:15 AM. I checked Visa API latency—normal. I checked PostgreSQL replication lag—found it. US-East replica was 45 seconds behind (normal: <2 seconds). This meant fraud checks used stale data. I investigated why. A long-running analytics query started at 2:10 AM was blocking replication. I killed the query, replication caught up in 80 seconds, and rejection rate dropped to 0.6% by 3:40 AM. Total incident: 1 hour 40 minutes, merchant loss: $150K. I then prevented recurrence: added 30-second query timeout on replicas, created separate analytics replica, wrote a debugging runbook, and implemented alerts for long queries. Six months later, zero replication incidents occurred. The runbook was adopted across 12 other services. I learned to always start debugging with data and patterns, not random code fixes.",
      situation_text: "At Stripe January 2024, TPM for Payment Processing handling 5M daily transactions worth $200M. Fraud detection system rejecting 15% legitimate transactions (normal: 0.5%), costing $90K per hour. On-call engineer escalated after 60 minutes.",
      task_text: "Debug critical production issue within 4 hours before VP escalation. Identify root cause across 8 microservices, 3 databases, 2 ML models.",
      action_text: "Started with data analysis in Datadog. Found pattern: 92% rejections in US-East Visa cards at 2:15 AM. Formed 3 hypotheses, tested systematically. Found PostgreSQL replication lag (45s vs normal <2s). Identified blocking analytics query. Killed query, replication recovered in 80s. Implemented prevention: query timeouts, separate analytics replica, runbook, alerts.",
      result_text: "Resolved in 1h 40min (merchant loss: $150K). Zero replication incidents in 6 months. Runbook adopted across 12 services.",
      situation_score: 5,
      task_score: 5,
      action_score: 5,
      result_score: 4,
      overall_score: 4.75,
      competency_scores: {
        "Debugging": 4,
        "Code Quality": 3,
        "Problem Solving": 5,
        "Complexity Analysis": 4
      },
      question_type: "technical",
      is_good_example: true
    };
    
    // Insert Behavioral
    const result1 = await db.query(`
      INSERT INTO sample_answers (
        category_id, question_text, answer_text,
        situation_text, task_text, action_text, result_text,
        situation_score, task_score, action_score, result_score, overall_score,
        competency_scores, question_type, is_good_example
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      behavioral.category_id, behavioral.question_text, behavioral.answer_text,
      behavioral.situation_text, behavioral.task_text, behavioral.action_text, behavioral.result_text,
      behavioral.situation_score, behavioral.task_score, behavioral.action_score, behavioral.result_score, behavioral.overall_score,
      JSON.stringify(behavioral.competency_scores), behavioral.question_type, behavioral.is_good_example
    ]);
    
    console.log(`✅ Inserted Behavioral sample (ID: ${result1.rows[0].id})`);
    
    // Insert Technical
    const result2 = await db.query(`
      INSERT INTO sample_answers (
        category_id, question_text, answer_text,
        situation_text, task_text, action_text, result_text,
        situation_score, task_score, action_score, result_score, overall_score,
        competency_scores, question_type, is_good_example
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      technical.category_id, technical.question_text, technical.answer_text,
      technical.situation_text, technical.task_text, technical.action_text, technical.result_text,
      technical.situation_score, technical.task_score, technical.action_score, technical.result_score, technical.overall_score,
      JSON.stringify(technical.competency_scores), technical.question_type, technical.is_good_example
    ]);
    
    console.log(`✅ Inserted Technical sample (ID: ${result2.rows[0].id})`);
    
    // Summary
    const count = await db.query('SELECT COUNT(*) FROM sample_answers');
    console.log(`\n📊 Total samples in DB: ${count.rows[0].count}`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

manualInsert();