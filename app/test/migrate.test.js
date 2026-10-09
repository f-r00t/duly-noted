const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');
const { migrate, pendingMigrations, MIGRATIONS_DIR } = require('../src/migrate');
const { createPgStore } = require('../src/store');

const silent = { info() {}, warn() {}, error() {} };
const versions = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();
const TEST_DB = 'duly_noted_migrate_test';

// Needs PostgreSQL, like the postgres run of the API tests.
describe('migrations', { skip: !process.env.PGHOST && 'PGHOST not set' }, () => {
  let admin;
  let pool;

  before(async () => {
    // A database of its own, created empty, so this suite starts from nothing
    // without disturbing the API tests that run against the same server.
    admin = new Pool();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
    pool = new Pool({ database: TEST_DB });
  });

  after(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.end();
  });

  test('reports every migration as pending on an empty database', async () => {
    assert.deepEqual(await pendingMigrations(pool), versions);
  });

  test('the store refuses to start before the schema is migrated', async () => {
    const store = createPgStore(pool, { log: silent });
    await assert.rejects(store.init({ retries: 1 }), /pending migrations: 0001_create-todos/);
  });

  test('applies every migration once, in order', async () => {
    assert.deepEqual(await migrate(pool), versions);
    assert.deepEqual(await pendingMigrations(pool), []);
    assert.deepEqual(await migrate(pool), []);
    const { rows } = await pool.query('SELECT name FROM pgmigrations ORDER BY id');
    assert.deepEqual(rows.map((r) => r.name), versions);
  });

  test('the store starts once the schema is migrated', async () => {
    const store = createPgStore(pool, { log: silent });
    await store.init();
    assert.equal((await store.create('migrated')).title, 'migrated');
  });

  test('rolls back a failing migration and records nothing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    for (const v of versions) fs.copyFileSync(path.join(MIGRATIONS_DIR, `${v}.sql`), path.join(dir, `${v}.sql`));
    fs.writeFileSync(path.join(dir, '9999_broken.sql'), '-- Up Migration\nCREATE TABLE half_done (id int);\nSELECT 1 / 0;\n');

    await assert.rejects(migrate(pool, { dir }), /division by zero/);
    assert.equal((await pool.query("SELECT to_regclass('half_done') AS t")).rows[0].t, null);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM pgmigrations WHERE name = '9999_broken'")).rows[0].n, 0);
  });
});
