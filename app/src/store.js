const { Pool } = require('pg');

// Both stores expose the same interface:
//   init, ping, list, create, setCompleted, remove, close

function createMemoryStore() {
  let nextId = 1;
  const todos = new Map();

  return {
    async init() {},
    async ping() {},
    async list() {
      return [...todos.values()];
    },
    async create(title) {
      const todo = {
        id: nextId++,
        title,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      todos.set(todo.id, todo);
      return todo;
    },
    async setCompleted(id, completed) {
      const todo = todos.get(id);
      if (!todo) return null;
      todo.completed = completed;
      return todo;
    },
    async remove(id) {
      return todos.delete(id);
    },
    async close() {},
  };
}

const COLUMNS = 'id, title, completed, created_at AS "createdAt"';

// Connection settings come from the standard PG* environment variables
// (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
function createPgStore(pool = new Pool()) {
  return {
    async init({ retries = 30, delayMs = 1000 } = {}) {
      for (let attempt = 1; ; attempt++) {
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS todos (
              id         SERIAL PRIMARY KEY,
              title      TEXT NOT NULL,
              completed  BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )`);
          return;
        } catch (err) {
          if (attempt >= retries) throw err;
          console.warn(`database not ready (${err.message}), retrying...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    },
    async ping() {
      await pool.query('SELECT 1');
    },
    async list() {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM todos ORDER BY id`);
      return rows;
    },
    async create(title) {
      const { rows } = await pool.query(
        `INSERT INTO todos (title) VALUES ($1) RETURNING ${COLUMNS}`,
        [title],
      );
      return rows[0];
    },
    async setCompleted(id, completed) {
      const { rows } = await pool.query(
        `UPDATE todos SET completed = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, completed],
      );
      return rows[0] ?? null;
    },
    async remove(id) {
      const { rowCount } = await pool.query('DELETE FROM todos WHERE id = $1', [id]);
      return rowCount > 0;
    },
    async close() {
      await pool.end();
    },
  };
}

module.exports = { createMemoryStore, createPgStore };
