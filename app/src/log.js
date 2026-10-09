// Minimal structured logger: one JSON object per line on stdout, so that
// `kubectl logs` and any log collector can parse it without configuration.
function createLogger(stream = process.stdout) {
  const write = (level, msg, fields) => {
    stream.write(`${JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })}\n`);
  };
  return {
    info: (msg, fields = {}) => write('info', msg, fields),
    warn: (msg, fields = {}) => write('warn', msg, fields),
    error: (msg, fields = {}) => write('error', msg, fields),
  };
}

module.exports = { createLogger, logger: createLogger() };
