const { logger } = require('./log');

// Waits until the database answers a trivial query. In the cluster the
// application and the migration Job can start a moment before PostgreSQL
// accepts connections, so a few failures are expected.
async function waitForDatabase(pool, { retries = 30, delayMs = 1000, log = logger } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt >= retries) throw err;
      log.warn('database not ready, retrying', { attempt, retries, error: err.message });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { waitForDatabase };
