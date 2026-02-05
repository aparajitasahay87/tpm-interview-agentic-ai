const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL.includes('render.com') 
    ? { rejectUnauthorized: false } 
    : false
});
  
  try {
    console.log('🔄 Running migration: 006_drop_level_constraint.sql...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../db/migrations/006_drop_level_constraint.sql'),
      'utf8'
    );
    
    await pool.query(migrationSQL);
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}


runMigration();