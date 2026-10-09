const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const { logger } = require('./log');

const MAX_TITLE_LENGTH = 200;
// Probes hit these every few seconds; logging them would drown everything else.
const UNLOGGED_PATHS = new Set(['/healthz', '/readyz']);
const REQUEST_ID = /^[\w.-]{1,128}$/;

function parseId(raw) {
  return /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null;
}

// One log line per request once the response has been sent: what was asked
// for, what came back and how long it took. The request id is taken from an
// X-Request-Id header when a proxy supplies one and generated otherwise, and
// is echoed back so a client can quote it.
function requestLogger(log) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    const incoming = req.get('x-request-id');
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.set('X-Request-Id', requestId);
    res.on('finish', () => {
      if (UNLOGGED_PATHS.has(req.path)) return;
      log.info('request', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e3) / 1e3,
      });
    });
    next();
  };
}

function createApp(store, { log = logger } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger(log));
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Liveness: the process is up. Readiness: the database answers.
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (req, res) => {
    try {
      await store.ping();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.get('/api/todos', async (req, res) => {
    res.json(await store.list());
  });

  app.post('/api/todos', async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > MAX_TITLE_LENGTH) {
      return res
        .status(400)
        .json({ error: `title must be 1-${MAX_TITLE_LENGTH} characters` });
    }
    res.status(201).json(await store.create(title));
  });

  app.patch('/api/todos/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(404).json({ error: 'todo not found' });
    if (typeof req.body?.completed !== 'boolean') {
      return res.status(400).json({ error: 'completed must be a boolean' });
    }
    const todo = await store.setCompleted(id, req.body.completed);
    if (!todo) return res.status(404).json({ error: 'todo not found' });
    res.json(todo);
  });

  app.delete('/api/todos/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null || !(await store.remove(id))) {
      return res.status(404).json({ error: 'todo not found' });
    }
    res.status(204).end();
  });

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(err.status).json({ error: 'invalid request body' });
    }
    log.error('request failed', { requestId: res.locals.requestId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp, MAX_TITLE_LENGTH };
