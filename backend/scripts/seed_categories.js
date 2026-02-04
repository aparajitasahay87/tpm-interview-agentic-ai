const { Pool } = require('pg');
require('dotenv').config();

async function seedCategories() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com') 
      ? { rejectUnauthorized: false } 
      : false
  });
  
  try {
    console.log('🌱 Seeding categories...');
    
    // Insert 5 categories (without company names)
    const categories = [
      {
        name: 'Program Sense',
        description: 'Program kickoff, MVP scoping, risk mitigation, execution, prioritization, and strategic influence',
        icon: '📊',
        competencies: JSON.stringify(['Program Kickoff', 'Risk Mitigation', 'Execution', 'Prioritization', 'Strategic Influence', 'Communication'])
      },
      {
        name: 'System Design',
        description: 'Scalability, reliability, trade-offs, data modeling, and technical architecture decisions',
        icon: '🏗️',
        competencies: JSON.stringify(['Scalability', 'Trade-offs', 'Components', 'Data Flow', 'Reliability'])
      },
      {
        name: 'Behavioral',
        description: 'Leadership, failure recovery, conflict resolution, cross-functional collaboration, and adaptability',
        icon: '👥',
        competencies: JSON.stringify(['Leadership', 'Conflict Resolution', 'Influence', 'Ownership', 'Communication', 'Adaptability'])
      },
      {
        name: 'Technical',
        description: 'Problem-solving, code quality, complexity analysis, debugging, and technical decision making',
        icon: '💻',
        competencies: JSON.stringify(['Problem Solving', 'Code Quality', 'Complexity Analysis', 'Debugging'])
      },
      {
        name: 'Partnership',
        description: 'Cross-functional influence, negotiation, stakeholder management, and alignment building',
        icon: '🤝',
        competencies: JSON.stringify(['Influence', 'Negotiation', 'Communication', 'Cross-functional Alignment', 'Stakeholder Management'])
      }
    ];
    
    for (const category of categories) {
      await pool.query(`
        INSERT INTO categories (name, description, icon, competencies)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO UPDATE 
        SET description = EXCLUDED.description,
            icon = EXCLUDED.icon,
            competencies = EXCLUDED.competencies
      `, [category.name, category.description, category.icon, category.competencies]);
      
      console.log(`✅ Seeded: ${category.name}`);
    }
    
    // Verify
    const result = await pool.query('SELECT id, name, icon, question_count FROM categories ORDER BY id');
    console.log('\n📋 Categories in database:');
    result.rows.forEach(cat => {
      console.log(`  ${cat.icon} ${cat.id}. ${cat.name} (${cat.question_count} questions)`);
    });
    
    console.log('\n✅ Categories seeded successfully!');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedCategories();