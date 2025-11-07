#!/usr/bin/env node
/**
 * BaseBytes Migration Runner
 * Runs SQL migrations in order
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function runMigrations() {
  console.log('=== BaseBytes Migration Runner ===\n');

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Get applied migrations
  const appliedResult = await pool.query('SELECT name FROM migrations ORDER BY name');
  const appliedMigrations = new Set(appliedResult.rows.map(r => r.name));

  // Get migration files
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('✓ No migrations found');
    return;
  }

  console.log(`Found ${files.length} migration file(s)\n`);

  let appliedCount = 0;

  for (const file of files) {
    if (appliedMigrations.has(file)) {
      console.log(`⏭️  ${file} (already applied)`);
      continue;
    }

    console.log(`▶️  Applying ${file}...`);

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      await pool.query(sql);
      await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      console.log(`✓ ${file} applied successfully\n`);
      appliedCount++;
    } catch (error) {
      console.error(`❌ Failed to apply ${file}:`, error.message);
      process.exit(1);
    }
  }

  if (appliedCount === 0) {
    console.log('✓ All migrations already applied');
  } else {
    console.log(`✓ Applied ${appliedCount} migration(s)`);
  }
}

runMigrations()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    pool.end();
    process.exit(1);
  });
