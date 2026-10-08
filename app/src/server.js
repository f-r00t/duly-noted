const { createApp } = require('./app');
const { createMemoryStore, createPgStore } = require('./store');

const port = Number(process.env.PORT) || 3000;

async function main() {
  // Without a configured database we fall back to a non-persistent store,
  // which is only meant for local development.
  const usePg = Boolean(process.env.PGHOST);
  const store = usePg ? createPgStore() : createMemoryStore();
  if (!usePg) console.warn('PGHOST not set: using in-memory store, todos are not persisted');

  await store.init();
  const server = createApp(store).listen(port, () => {
    console.log(`duly-noted listening on port ${port}`);
  });

  const shutdown = () => {
    server.close(() => store.close().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
