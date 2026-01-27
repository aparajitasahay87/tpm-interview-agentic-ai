const { Pool } = require('pg');
require('dotenv').config();

// Support both DATABASE_URL (Render/production) and individual vars (local)
const pool = process.env.DATABASE_URL 
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('render.com') 
        ? { rejectUnauthorized: false } 
        : false
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

const query = (text, params) => pool.query(text, params);

// Get pool instance (for Week 2 Day 3)
function getPool() {
  return pool;
}

module.exports = {
  query,
  pool,
  getPool
};