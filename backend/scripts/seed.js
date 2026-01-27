const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runSeed() {
 const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL.includes('render.com') 
    ? { rejectUnauthorized: false } 
    : false
});
  
  try {
    console.log('🌱 Seeding database with ideal TPM answers...');
    
    const seedSQL = fs.readFileSync(
      path.join(__dirname, '../db/seeds/001_ideal_tpm_answers.sql'),
      'utf8'
    );
    
    await pool.query(seedSQL);
    console.log('✅ Seed data added successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSeed();