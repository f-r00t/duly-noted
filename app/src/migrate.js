const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { runner } = require('node-pg-migrate');
const { waitForDatabase } = require('./db');
const { logger } = require('./log');

// SQL files in migrations/, applied in filename order by node-pg-migrate,
// which records each one in the pgmigrations table and takes an advisory
// lock so that two runners never apply the same migration at once.
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATIONS_TABLE = 'pgmigrations';

const baseOptions = (dir) => ({
  dir,
  migrationsTable: MIGRATIONS_TABLE,
  direction: 'up',
  checkOrder: true,
  // A second runner waits for the first instead of failing, then finds
  // nothing left to do.
  advisoryLockMode: 'wait',
  // Either every pending migration applies or none does.
  singleTransaction: true,
  log: () => {},
});

// Applies every pending migration and returns their names.
async function migrate(pool, { dir = MIGRATIONS_DIR } = {}) {
  const client = await pool.connect();
  try {
    const applied = await runner({ ...baseOptions(dir), dbClient: client });
    return applied.map((m) => m.name);
  } finally {
    client.release();
  }
}

// Names of the migrations on disk that the database has not run. Read-only:
// a database without the migrations table has not run any of them.
async function pendingMigrations(pool, { dir = MIGRATIONS_DIR } = {}) {
  const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [MIGRATIONS_TABLE]);
  if (!rows[0].exists) {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();
  }
  const client = await pool.connect();
  try {
    const pending = await runner({ ...baseOptions(dir), dbClient: client, dryRun: true, noLock: true });
    return pending.map((m) => m.name);
  } finally {
    client.release();
  }
}

// `node src/migrate.js`: connection settings come from the PG* variables.
async function main() {
  const pool = new Pool();
  try {
    await waitForDatabase(pool);
    const applied = await migrate(pool);
    logger.info(applied.length > 0 ? 'applied migrations' : 'no pending migrations', { migrations: applied });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('migration failed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { migrate, pendingMigrations, MIGRATIONS_DIR, MIGRATIONS_TABLE };
