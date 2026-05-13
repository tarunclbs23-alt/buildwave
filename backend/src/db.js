require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/buildwave',
});

async function init() {
  try {
    const client = await pool.connect();
    console.log('[DB] Connected to PostgreSQL');

    // Create the jobs table (dropping old one to fix schema issues)
    await client.query(`DROP TABLE IF EXISTS jobs`);
    await client.query(`
      CREATE TABLE jobs (
        id VARCHAR(255) PRIMARY KEY,
        repo VARCHAR(255) NOT NULL,
        "repoFullName" VARCHAR(255),
        branch VARCHAR(255),
        sha VARCHAR(255) NOT NULL,
        author VARCHAR(255),
        message TEXT,
        "timestamp" VARCHAR(255),
        pipeline_file VARCHAR(255),
        priority INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL,
        stages JSONB,
        "createdAt" VARCHAR(255),
        "startedAt" VARCHAR(255),
        "completedAt" VARCHAR(255)
      )
    `);
    
    console.log('[DB] Jobs table initialized');
    client.release();
  } catch (err) {
    console.error('[DB] Failed to initialize database:', err);
    throw err;
  }
}

module.exports = {
  pool,
  init,
  query: (text, params) => pool.query(text, params),
};
