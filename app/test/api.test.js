const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createApp, MAX_TITLE_LENGTH } = require('../src/app');
const { createMemoryStore, createPgStore } = require('../src/store');

// The same suite runs against every store. The PostgreSQL run is skipped
// unless PGHOST is set (CI provides a postgres service container).
const backends = [{ name: 'memory', setup: async () => ({ store: createMemoryStore() }) }];

if (process.env.PGHOST) {
  backends.push({
    name: 'postgres',
    setup: async () => {
      const pool = new Pool();
      const store = createPgStore(pool);
      await store.init();
      return { store, reset: () => pool.query('TRUNCATE todos RESTART IDENTITY') };
    },
  });
}

for (const backend of backends) {
  describe(`todo API (${backend.name} store)`, () => {
    let server;
    let store;
    let reset;
    let base;

    const request = (method, path, body) =>
      fetch(base + path, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    const createTodo = async (title) => (await request('POST', '/api/todos', { title })).json();

    before(async () => {
      ({ store, reset } = await backend.setup());
      server = createApp(store).listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
      base = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await store.close();
    });

    beforeEach(async () => {
      if (reset) return reset();
      for (const todo of await store.list()) await store.remove(todo.id);
    });

    test('health endpoints respond', async () => {
      assert.equal((await request('GET', '/healthz')).status, 200);
      assert.equal((await request('GET', '/readyz')).status, 200);
    });

    test('serves the frontend', async () => {
      const res = await request('GET', '/');
      assert.equal(res.status, 200);
      assert.match(await res.text(), /Duly Noted/);
    });

    test('starts with an empty list', async () => {
      const res = await request('GET', '/api/todos');
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), []);
    });

    test('creates a todo', async () => {
      const res = await request('POST', '/api/todos', { title: '  buy milk  ' });
      assert.equal(res.status, 201);
      const todo = await res.json();
      assert.equal(todo.title, 'buy milk');
      assert.equal(todo.completed, false);
      assert.equal(typeof todo.id, 'number');
      assert.ok(!Number.isNaN(Date.parse(todo.createdAt)));

      const todos = await (await request('GET', '/api/todos')).json();
      assert.deepEqual(todos.map((t) => t.title), ['buy milk']);
    });

    test('lists todos in creation order', async () => {
      await createTodo('first');
      await createTodo('second');
      const todos = await (await request('GET', '/api/todos')).json();
      assert.deepEqual(todos.map((t) => t.title), ['first', 'second']);
    });

    test('rejects invalid titles', async () => {
      const invalid = [{}, { title: '' }, { title: '   ' }, { title: 42 }, { title: 'x'.repeat(MAX_TITLE_LENGTH + 1) }];
      for (const body of invalid) {
        assert.equal((await request('POST', '/api/todos', body)).status, 400);
      }
    });

    test('rejects malformed JSON', async () => {
      const res = await fetch(`${base}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      });
      assert.equal(res.status, 400);
    });

    test('completes and reopens a todo', async () => {
      const { id } = await createTodo('write tests');

      let res = await request('PATCH', `/api/todos/${id}`, { completed: true });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).completed, true);

      res = await request('PATCH', `/api/todos/${id}`, { completed: false });
      assert.equal((await res.json()).completed, false);
    });

    test('rejects a non-boolean completed value', async () => {
      const { id } = await createTodo('write tests');
      assert.equal((await request('PATCH', `/api/todos/${id}`, { completed: 'yes' })).status, 400);
    });

    test('deletes a todo', async () => {
      const { id } = await createTodo('temporary');
      assert.equal((await request('DELETE', `/api/todos/${id}`)).status, 204);
      assert.deepEqual(await (await request('GET', '/api/todos')).json(), []);
    });

    test('returns 404 for unknown or malformed ids', async () => {
      for (const id of ['9999', 'abc', '0', '-1', '99999999999999999999']) {
        assert.equal((await request('PATCH', `/api/todos/${id}`, { completed: true })).status, 404);
        assert.equal((await request('DELETE', `/api/todos/${id}`)).status, 404);
      }
    });
  });
}
