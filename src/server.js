const createApp = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const { startAll, stopAll } = require('./jobs/cron');

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`🚀 Civic Issue API running on port ${config.port} [${config.env}]`);
  logger.info(`📖 Swagger UI: http://localhost:${config.port}/api/docs`);
  logger.info(`🏥 Health:     http://localhost:${config.port}/health`);

  // Start background jobs (skip in test environment)
  if (config.env !== 'test') {
    startAll();
  }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  stopAll();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit if server hasn't closed in 10 s
  setTimeout(() => {
    logger.error('Forcing process exit after timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

module.exports = server; // for testing
