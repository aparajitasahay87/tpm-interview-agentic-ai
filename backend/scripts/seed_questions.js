const { Pool } = require('pg');
require('dotenv').config();

async function seedQuestions() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com') 
      ? { rejectUnauthorized: false } 
      : false
  });
  
  try {
    console.log('🌱 Seeding questions...\n');
    
    // Get category IDs
    const categoriesResult = await pool.query('SELECT id, name FROM categories ORDER BY id');
    const categoryMap = {};
    categoriesResult.rows.forEach(cat => {
      categoryMap[cat.name] = cat.id;
    });

    // =============================================
    // PROGRAM SENSE QUESTIONS (12)
    // =============================================
    const programSenseQuestions = [
      {
        question_text: 'How would you lead a project to migrate from one cloud provider to another?',
        difficulty: 'Hard',
        tags: ['migration', 'cloud', 'planning']
      },
      {
        question_text: "Let's say you join a project which is only 25% complete and has used 85% of resources, what would be your next steps?",
        difficulty: 'Hard',
        tags: ['resource_management', 'recovery', 'prioritization']
      },
      {
        question_text: 'Google needs to perform a disaster recovery exercise to test operation readiness in the event of major failures. How would you plan this?',
        difficulty: 'Medium',
        tags: ['disaster_recovery', 'planning', 'risk']
      },
      {
        question_text: "What's your process for starting a project from scratch?",
        difficulty: 'Medium',
        tags: ['project_kickoff', 'planning', 'process']
      },
      {
        question_text: 'How do you run a program? How do you define entry and exit criteria?',
        difficulty: 'Medium',
        tags: ['program_management', 'criteria', 'framework']
      },
      {
        question_text: 'Tell me about a time you drove a project, identified risks, and mitigated them throughout the program.',
        difficulty: 'Medium',
        tags: ['risk_management', 'mitigation', 'execution']
      },
      {
        question_text: 'Describe a time when you created a long-term multi-year roadmap.',
        difficulty: 'Hard',
        tags: ['roadmap', 'strategy', 'long_term_planning']
      },
      {
        question_text: 'How would you run a program for datacenter migration with 24/7 availability requirements?',
        difficulty: 'Hard',
        tags: ['migration', 'uptime', 'availability']
      },
      {
        question_text: 'Given a situation where you need to deploy a feature/system with limited resources, what would you do?',
        difficulty: 'Medium',
        tags: ['resource_constraints', 'prioritization', 'deployment']
      },
      {
        question_text: 'How do you communicate with stakeholders? Describe your approach to status reports, newsletters, and KPI tracking.',
        difficulty: 'Easy',
        tags: ['communication', 'stakeholders', 'reporting']
      },
      {
        question_text: 'Once given a project, how do you tackle the problem? Walk through your approach.',
        difficulty: 'Easy',
        tags: ['problem_solving', 'approach', 'methodology']
      },
      {
        question_text: 'How do you determine and measure the success of a project as it progresses?',
        difficulty: 'Medium',
        tags: ['metrics', 'success_criteria', 'tracking']
      }
    ];

    // =============================================
    // BEHAVIORAL QUESTIONS (15)
    // =============================================
    const behavioralQuestions = [
      {
        question_text: 'Tell me about a time you took a big risk and it failed. What did you learn? What would you do differently?',
        difficulty: 'Medium',
        tags: ['failure', 'risk', 'learning']
      },
      {
        question_text: 'Give me an example of a significant professional failure. What did you learn from this situation?',
        difficulty: 'Medium',
        tags: ['failure', 'learning', 'growth']
      },
      {
        question_text: 'Tell me about a time you made a significant mistake. What led you to making the wrong decision?',
        difficulty: 'Medium',
        tags: ['mistake', 'decision_making', 'reflection']
      },
      {
        question_text: 'Give an example of a tough or critical piece of feedback you received. What was it and what did you do about it?',
        difficulty: 'Medium',
        tags: ['feedback', 'growth', 'adaptation']
      },
      {
        question_text: 'Tell me about a time you strongly disagreed with your manager on something you deemed very important to the business.',
        difficulty: 'Hard',
        tags: ['conflict', 'disagreement', 'conviction']
      },
      {
        question_text: 'Tell me about a time you had significant, unanticipated obstacles to overcome in achieving a key goal. Were you eventually successful?',
        difficulty: 'Medium',
        tags: ['obstacles', 'persistence', 'problem_solving']
      },
      {
        question_text: 'Describe a time where you felt really strongly about something but ultimately lost the argument. How hard did you press the issue?',
        difficulty: 'Medium',
        tags: ['conflict', 'conviction', 'compromise']
      },
      {
        question_text: 'Tell me about a time where someone has openly challenged you. How did you handle this feedback?',
        difficulty: 'Medium',
        tags: ['challenge', 'feedback', 'conflict_resolution']
      },
      {
        question_text: "Tell me about a time you didn't have enough resources to do something you felt was important but found a creative way to get it done anyway.",
        difficulty: 'Medium',
        tags: ['creativity', 'resourcefulness', 'constraints']
      },
      {
        question_text: 'Tell me about a time when you solved a complex problem with a simple solution.',
        difficulty: 'Easy',
        tags: ['problem_solving', 'simplification', 'creativity']
      },
      {
        question_text: 'Describe a situation where you experienced resourcing constraints. How did you handle it?',
        difficulty: 'Medium',
        tags: ['constraints', 'resource_management', 'adaptation']
      },
      {
        question_text: 'What would you do if 4 people worked on a project but one person took all the credits?',
        difficulty: 'Medium',
        tags: ['conflict', 'fairness', 'team_dynamics']
      },
      {
        question_text: 'Describe a situation where you have failed and what you learned from it.',
        difficulty: 'Easy',
        tags: ['failure', 'learning', 'growth']
      },
      {
        question_text: 'Tell me about a time when you received constructive feedback and acted on it for improvement.',
        difficulty: 'Easy',
        tags: ['feedback', 'growth', 'action']
      },
      {
        question_text: 'Describe a time when you disagreed with a colleague and your initial stance was not clearly correct.',
        difficulty: 'Medium',
        tags: ['disagreement', 'humility', 'learning']
      }
    ];

    // =============================================
    // SYSTEM DESIGN QUESTIONS (8)
    // =============================================
    const systemDesignQuestions = [
      {
        question_text: 'Design a photo sharing system for a travel application.',
        difficulty: 'Hard',
        tags: ['design', 'scalability', 'storage']
      },
      {
        question_text: 'Design a photo sharing feature for a travel app. Discuss NoSQL vs SQL trade-offs.',
        difficulty: 'Hard',
        tags: ['design', 'database', 'tradeoffs']
      },
      {
        question_text: 'Design an end-to-end functionality for Facebook to allow users to download their information to their system.',
        difficulty: 'Hard',
        tags: ['design', 'data_export', 'privacy']
      },
      {
        question_text: 'Design a system to automate building access for 1000 employees across different departments with security constraints.',
        difficulty: 'Medium',
        tags: ['design', 'security', 'access_control']
      },
      {
        question_text: 'Design a data migration tool for AAD B2C to place user data in their registered geo-location data centers.',
        difficulty: 'Hard',
        tags: ['design', 'migration', 'geo_distribution']
      },
      {
        question_text: 'How would you design a URL shortener service?',
        difficulty: 'Medium',
        tags: ['design', 'scalability', 'hashing']
      },
      {
        question_text: 'Explain how you would implement a distributed hash table.',
        difficulty: 'Hard',
        tags: ['distributed_systems', 'hashing', 'architecture']
      },
      {
        question_text: 'Working with developers to discuss feature tradeoffs - How would you lead this meeting and technical discussion?',
        difficulty: 'Medium',
        tags: ['tradeoffs', 'collaboration', 'decision_making']
      }
    ];

    // =============================================
    // PARTNERSHIP QUESTIONS (6)
    // =============================================
    const partnershipQuestions = [
      {
        question_text: 'Sales thinks a new platform policy is too restrictive and stops revenue. Legal thinks it prevents lawsuits and negative PR. How would you handle this stakeholder conflict and drive alignment?',
        difficulty: 'Hard',
        tags: ['stakeholder_conflict', 'alignment', 'negotiation']
      },
      {
        question_text: 'What do you do when you need the support of a cross-functional team but they say they don\'t have time to help?',
        difficulty: 'Medium',
        tags: ['influence', 'cross_functional', 'persuasion']
      },
      {
        question_text: 'What is your approach to working with developers? How do you build effective partnerships?',
        difficulty: 'Easy',
        tags: ['collaboration', 'developers', 'partnership']
      },
      {
        question_text: 'Describe a time when you needed the cooperation of a peer or peers who were resistant to what you were trying to do. What did you do?',
        difficulty: 'Medium',
        tags: ['resistance', 'influence', 'persuasion']
      },
      {
        question_text: 'Tell me about a time you led a cross-functional team toward a common goal. How did you align everyone?',
        difficulty: 'Medium',
        tags: ['cross_functional', 'leadership', 'alignment']
      },
      {
        question_text: 'In a cross-functional project, how do you communicate progress to all stakeholders? Describe your communication strategy.',
        difficulty: 'Easy',
        tags: ['communication', 'stakeholders', 'transparency']
      }
    ];

    // =============================================
    // TECHNICAL QUESTIONS (4)
    // =============================================
    const technicalQuestions = [
      {
        question_text: 'You identify a new bug 2 days before the release of your new product feature. What do you do?',
        difficulty: 'Medium',
        tags: ['crisis', 'decision_making', 'release_management']
      },
      {
        question_text: 'During a recent product update you break something in the deployment pipeline. What do you do?',
        difficulty: 'Medium',
        tags: ['incident', 'debugging', 'deployment']
      },
      {
        question_text: 'If you are given 1000 streetview cars to improve the streetview product in Google Maps, how would you operationalize and run this program?',
        difficulty: 'Hard',
        tags: ['operations', 'scale', 'logistics']
      },
      {
        question_text: 'Describe a technical program you ran (with architecture diagram). What technical gaps did you identify and how did you mitigate risks?',
        difficulty: 'Hard',
        tags: ['technical_program', 'architecture', 'risk_mitigation']
      }
    ];

    // Combine all questions with category assignment
    const allQuestions = [
      ...programSenseQuestions.map(q => ({ ...q, category_name: 'Program Sense' })),
      ...behavioralQuestions.map(q => ({ ...q, category_name: 'Behavioral' })),
      ...systemDesignQuestions.map(q => ({ ...q, category_name: 'System Design' })),
      ...partnershipQuestions.map(q => ({ ...q, category_name: 'Partnership' })),
      ...technicalQuestions.map(q => ({ ...q, category_name: 'Technical' }))
    ];

    console.log(`📊 Total questions to seed: ${allQuestions.length}\n`);

    // Insert questions
    let insertedCount = 0;
    for (const question of allQuestions) {
      const categoryId = categoryMap[question.category_name];
      
      if (!categoryId) {
        console.log(`⚠️  Skipping question - category ${question.category_name} not found`);
        continue;
      }

      await pool.query(`
        INSERT INTO questions (category_id, question_text, difficulty, tags)
        VALUES ($1, $2, $3, $4)
      `, [categoryId, question.question_text, question.difficulty, question.tags]);
      
      insertedCount++;
      console.log(`✅ ${question.category_name} [${question.difficulty}]: ${question.question_text.substring(0, 60)}...`);
    }

    // Verify
    const verifyResult = await pool.query(`
      SELECT c.name as category, COUNT(*) as question_count
      FROM questions q
      JOIN categories c ON c.id = q.category_id
      GROUP BY c.name
      ORDER BY c.name
    `);

    console.log(`\n📊 Questions Summary:`);
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.category}: ${row.question_count} questions`);
    });
    
    console.log(`\n✅ Successfully seeded ${insertedCount} questions!`);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error('Full error:', error);
    throw error; // Re-throw so the calling code knows it failed
  } finally {
    await pool.end();
  }
}

// Export the function for use as a module
module.exports = seedQuestions;

// If run directly (not imported), execute the function
if (require.main === module) {
  seedQuestions()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}