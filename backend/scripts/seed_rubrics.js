const { Pool } = require('pg');
require('dotenv').config();

async function seedRubrics() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com') 
      ? { rejectUnauthorized: false } 
      : false
  });
  
  try {
    console.log('🌱 Seeding rubrics...\n');
    
    // =============================================
    // 1. PROGRAM SENSE RUBRICS (6 competencies)
    // =============================================
    const programSenseRubrics = [
      {
        category_name: 'Program Sense',
        competency_name: 'Program Kickoff',
        level_1: 'Mentions MVP, scoping, or product requirements',
        level_3: 'Provides solid product sense for scoping an MVP and ensures clarity on success metrics for moving beyond MVP',
        level_5: 'Exceptional MVP scoping with quantified success metrics (e.g., 30% adoption target), clear go/no-go criteria, phased rollout plan with defined milestones, and cross-functional stakeholder alignment on definition of done',
        weight: 1.0
      },
      {
        category_name: 'Program Sense',
        competency_name: 'Risk Mitigation',
        level_1: 'Mentions risks or potential issues',
        level_3: 'Demonstrates frequent communication of risks and is not afraid to ask for help',
        level_5: 'Proactively identifies 10+ risks early, maintains risk register with mitigation plans, communicates weekly updates to stakeholders with proposed solutions, and reduced project delays by 40% through early escalation',
        weight: 1.0
      },
      {
        category_name: 'Program Sense',
        competency_name: 'Execution',
        level_1: 'Describes executing a project or completing tasks',
        level_3: 'Shows flexible execution style and willingness to adapt to the needs of a specific program or team. Ensures cross-functional alignment at every milestone',
        level_5: 'Demonstrates adaptive execution across 5+ cross-functional teams, pivoted strategy 3 times based on changing requirements, maintained 95% milestone delivery rate, and established reusable execution framework adopted by 3 other teams',
        weight: 1.0
      },
      {
        category_name: 'Program Sense',
        competency_name: 'Prioritization',
        level_1: 'Mentions prioritizing tasks or features',
        level_3: 'Shows flexible execution style with clear prioritization framework and willingness to adapt to program needs',
        level_5: 'Developed data-driven prioritization framework (RICE/value vs effort), deprioritized 40% of scope to hit critical deadline, aligned 5 VP-level stakeholders on priority stack rank, and delivered 80% of impact with 50% of original scope',
        weight: 1.0
      },
      {
        category_name: 'Program Sense',
        competency_name: 'Strategic Influence',
        level_1: 'Mentions influencing stakeholders or providing input',
        level_3: 'Displays examples where clear proposals were provided and buy-in was obtained to help shape the team\'s strategy',
        level_5: 'Created strategic proposal that shifted team roadmap, obtained buy-in from 8 senior stakeholders through data-driven presentation, influenced $2M budget allocation, and proposal became company-wide standard adopted by 5 other orgs',
        weight: 1.0
      },
      {
        category_name: 'Program Sense',
        competency_name: 'Communication',
        level_1: 'Mentions communicating with team or stakeholders',
        level_3: 'When there is a missed deadline, shares why it happened as well as next steps to move forward including getting support from other teams to debug',
        level_5: 'Proactively communicated critical 2-week delay with root cause analysis, presented 3 mitigation options with trade-offs, coordinated 4 teams to recover timeline, and established weekly stakeholder updates that became team standard',
        weight: 1.0
      }
    ];

    // =============================================
    // 2. BEHAVIORAL RUBRICS (6 competencies)
    // =============================================
    const behavioralRubrics = [
      {
        category_name: 'Behavioral',
        competency_name: 'Leadership',
        level_1: 'Mentions leading a team or taking ownership',
        level_3: 'Demonstrates leadership examples with clear structure, context, and impact on team performance',
        level_5: 'Led cross-functional team of 15+ through ambiguous project, increased team velocity by 40%, mentored 3 junior team members to promotion, and established leadership practices adopted across organization',
        weight: 1.0
      },
      {
        category_name: 'Behavioral',
        competency_name: 'Conflict Resolution',
        level_1: 'Mentions disagreement or conflict',
        level_3: 'Displays detailed examples of how conflict was approached, resolved, or prevented with both sides considered',
        level_5: 'Resolved VP-level conflict between 2 organizations through 1:1 mediation, identified shared goals, facilitated compromise that unblocked $5M project, and established conflict resolution framework preventing future escalations',
        weight: 1.0
      },
      {
        category_name: 'Behavioral',
        competency_name: 'Influence',
        level_1: 'Mentions convincing others or getting agreement',
        level_3: 'Shows empathy and strong EQ in building trust and influencing others without direct authority',
        level_5: 'Influenced 6 senior stakeholders to change strategic direction through data-driven proposal, built coalition across 4 organizations, achieved unanimous buy-in without formal authority, and new strategy delivered 200% ROI',
        weight: 1.0
      },
      {
        category_name: 'Behavioral',
        competency_name: 'Ownership',
        level_1: 'Mentions taking responsibility or being accountable',
        level_3: 'Demonstrates taking full ownership of outcomes, including failures, with clear examples of accountability',
        level_5: 'Took ownership of critical $2M project failure, conducted blameless postmortem with 20+ stakeholders, implemented 8 process improvements, and recovery plan delivered successful relaunch in 6 weeks',
        weight: 1.0
      },
      {
        category_name: 'Behavioral',
        competency_name: 'Communication',
        level_1: 'Mentions communicating or providing updates',
        level_3: 'Provides clear structure and context with examples, including quick summary and transparency',
        level_5: 'Established executive communication framework with weekly updates to C-suite, presented 10+ strategic reviews with data-driven insights, and communication template adopted as company standard across 50+ teams',
        weight: 1.0
      },
      {
        category_name: 'Behavioral',
        competency_name: 'Adaptability',
        level_1: 'Mentions adapting to change or being flexible',
        level_3: 'Shows examples of adapting to changing requirements, pivoting strategy, and remaining effective under uncertainty',
        level_5: 'Pivoted project strategy 4 times in 6 months due to market changes, maintained team morale through ambiguity, delivered on-time despite 50% scope change, and adaptability approach became team playbook',
        weight: 1.0
      }
    ];

    // =============================================
    // 3. SYSTEM DESIGN RUBRICS (5 competencies)
    // =============================================
    const systemDesignRubrics = [
      {
        category_name: 'System Design',
        competency_name: 'Scalability',
        level_1: 'Mentions scaling or handling growth',
        level_3: 'Discusses scalability considerations, bottlenecks, and how the system handles increased load',
        level_5: 'Designed system scaling from 1K to 10M users, implemented horizontal scaling with auto-scaling groups, reduced latency by 60% at 100x load, and architecture pattern adopted for 5 other services',
        weight: 1.0
      },
      {
        category_name: 'System Design',
        competency_name: 'Trade-offs',
        level_1: 'Mentions different approaches or options',
        level_3: 'Clearly articulates technical trade-offs between different design choices with pros and cons',
        level_5: 'Evaluated 4 architectural approaches with detailed trade-off matrix (latency vs cost vs complexity), presented to engineering leadership, recommended approach saved $500K annually, and decision framework reused across org',
        weight: 1.0
      },
      {
        category_name: 'System Design',
        competency_name: 'Components',
        level_1: 'Mentions system components or architecture',
        level_3: 'Describes key system components, their interactions, and how they work together',
        level_5: 'Designed 8-component microservices architecture with clear API contracts, implemented circuit breakers and graceful degradation, achieved 99.99% uptime, and component design became org-wide standard',
        weight: 1.0
      },
      {
        category_name: 'System Design',
        competency_name: 'Data Flow',
        level_1: 'Mentions data or how information moves',
        level_3: 'Explains data flow through the system, including storage, processing, and retrieval',
        level_5: 'Architected data pipeline processing 5TB daily, implemented real-time and batch processing, reduced data latency from 24h to 5min, and pipeline architecture reused for 10+ other data products',
        weight: 1.0
      },
      {
        category_name: 'System Design',
        competency_name: 'Reliability',
        level_1: 'Mentions uptime, errors, or system health',
        level_3: 'Discusses reliability considerations including fault tolerance, monitoring, and error handling',
        level_5: 'Implemented comprehensive reliability framework with circuit breakers, retry logic, monitoring dashboards, improved SLA from 99.5% to 99.95%, and reduced MTTR from 2h to 15min',
        weight: 1.0
      }
    ];

    // =============================================
    // 4. TECHNICAL RUBRICS (4 competencies)
    // =============================================
    const technicalRubrics = [
      {
        category_name: 'Technical',
        competency_name: 'Problem Solving',
        level_1: 'Mentions solving a technical problem',
        level_3: 'Describes systematic approach to debugging and problem-solving with clear methodology',
        level_5: 'Debugged critical production issue affecting 10K users, used systematic root cause analysis, implemented permanent fix in 4 hours, and created runbook preventing 12 similar incidents',
        weight: 1.0
      },
      {
        category_name: 'Technical',
        competency_name: 'Code Quality',
        level_1: 'Mentions writing code or implementing features',
        level_3: 'Discusses code quality practices including testing, documentation, and maintainability',
        level_5: 'Established code quality standards with 90% test coverage requirement, implemented automated linting and review process, reduced bug rate by 70%, and standards adopted across 8 engineering teams',
        weight: 1.0
      },
      {
        category_name: 'Technical',
        competency_name: 'Complexity Analysis',
        level_1: 'Mentions algorithm efficiency or performance',
        level_3: 'Analyzes time and space complexity of solutions with Big-O notation and optimization opportunities',
        level_5: 'Optimized algorithm from O(n²) to O(n log n), reduced processing time from 10min to 30sec for 1M records, and optimization pattern documented and reused in 15 other services',
        weight: 1.0
      },
      {
        category_name: 'Technical',
        competency_name: 'Debugging',
        level_1: 'Mentions fixing bugs or issues',
        level_3: 'Describes systematic debugging approach with tools, techniques, and root cause identification',
        level_5: 'Debugged race condition affecting 0.1% of users, used distributed tracing and log correlation, identified root cause in 2 hours, implemented fix deployed to 50M users, and debugging methodology became team standard',
        weight: 1.0
      }
    ];

    // =============================================
    // 5. PARTNERSHIP RUBRICS (5 competencies)
    // =============================================
    const partnershipRubrics = [
      {
        category_name: 'Partnership',
        competency_name: 'Influence',
        level_1: 'Mentions working with partners or other teams',
        level_3: 'Displays empathy and strong EQ in building trust and winning influence with partner teams',
        level_5: 'Built trusted relationships with 5 partner organizations, influenced roadmap alignment saving 6 months of duplicate work, achieved 100% partner satisfaction scores, and collaboration model adopted company-wide',
        weight: 1.0
      },
      {
        category_name: 'Partnership',
        competency_name: 'Negotiation',
        level_1: 'Mentions negotiating or reaching agreements',
        level_3: 'Shows win-win approach to negotiation with examples of compromise and mutual benefit',
        level_5: 'Negotiated partnership terms with 3 external vendors, achieved 30% cost reduction while improving SLAs, established master agreement saving $2M annually, and negotiation framework reused for 10+ other partnerships',
        weight: 1.0
      },
      {
        category_name: 'Partnership',
        competency_name: 'Communication',
        level_1: 'Mentions communicating with partners',
        level_3: 'Demonstrates clear, frequent, and transparent communication with partner teams and stakeholders',
        level_5: 'Established bi-weekly partner sync across 6 organizations, created shared dashboard for visibility, reduced escalations by 80%, and communication framework adopted as standard for all cross-org partnerships',
        weight: 1.0
      },
      {
        category_name: 'Partnership',
        competency_name: 'Cross-functional Alignment',
        level_1: 'Mentions working with multiple teams',
        level_3: 'Shows ability to align cross-functional teams on shared goals with clear examples',
        level_5: 'Aligned 8 cross-functional teams (eng, product, design, legal, marketing, sales) on unified roadmap, resolved 15+ conflicting priorities, achieved 95% milestone delivery, and alignment process became org playbook',
        weight: 1.0
      },
      {
        category_name: 'Partnership',
        competency_name: 'Stakeholder Management',
        level_1: 'Mentions managing stakeholders',
        level_3: 'Demonstrates proactive stakeholder management with regular updates and clear communication',
        level_5: 'Managed 12 executive stakeholders across 4 organizations, conducted monthly business reviews with metrics dashboards, achieved 100% satisfaction scores, and stakeholder framework adopted for all strategic initiatives',
        weight: 1.0
      }
    ];

    // Combine all rubrics
    const allRubrics = [
      ...programSenseRubrics,
      ...behavioralRubrics,
      ...systemDesignRubrics,
      ...technicalRubrics,
      ...partnershipRubrics
    ];

    // Get category IDs
    const categoriesResult = await pool.query('SELECT id, name FROM categories');
    const categoryMap = {};
    categoriesResult.rows.forEach(cat => {
      categoryMap[cat.name] = cat.id;
    });

    // Insert rubrics
    let insertedCount = 0;
    for (const rubric of allRubrics) {
      const categoryId = categoryMap[rubric.category_name];
      
      if (!categoryId) {
        console.log(`⚠️  Skipping ${rubric.competency_name} - category ${rubric.category_name} not found`);
        continue;
      }

      await pool.query(`
        INSERT INTO rubrics (category_id, competency_name, level_1_description, level_3_description, level_5_description, weight)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (category_id, competency_name) 
        DO UPDATE SET
          level_1_description = EXCLUDED.level_1_description,
          level_3_description = EXCLUDED.level_3_description,
          level_5_description = EXCLUDED.level_5_description,
          weight = EXCLUDED.weight
      `, [categoryId, rubric.competency_name, rubric.level_1, rubric.level_3, rubric.level_5, rubric.weight]);
      
      insertedCount++;
      console.log(`✅ ${rubric.category_name} → ${rubric.competency_name}`);
    }

    // Verify
    const verifyResult = await pool.query(`
      SELECT c.name as category, COUNT(*) as competency_count
      FROM rubrics r
      JOIN categories c ON c.id = r.category_id
      GROUP BY c.name
      ORDER BY c.name
    `);

    console.log(`\n📊 Rubrics Summary:`);
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.category}: ${row.competency_count} competencies`);
    });
    
    console.log(`\n✅ Successfully seeded ${insertedCount} rubrics!`);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedRubrics();