const { createApp } = require('./app');
const { createMemoryStore, createPgStore } = require('./store');
const { logger: log } = require('./log');

const port = Number(process.env.PORT) || 3000;

async function main() {
  // Without a configured database we fall back to a non-persistent store,
  // which is only meant for local development.
  const usePg = Boolean(process.env.PGHOST);
  const store = usePg ? createPgStore() : createMemoryStore();
  if (!usePg) log.warn('PGHOST not set: using in-memory store, todos are not persisted');

  await store.init();
  if (usePg) {
    log.info('connected to PostgreSQL', {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT) || 5432,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
    });
  }

  const server = createApp(store, { log }).listen(port, () => {
    log.info('listening', { port });
  });

  const shutdown = (signal) => {
    log.info('shutting down', { signal });
    server.close(() => store.close().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('startup failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
