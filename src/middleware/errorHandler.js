const logger = require('../utils/logger');
const { sendError } = require('../utils/response');

/**
 * Global error-handling middleware.
 * Must be registered LAST (after all routes) with 4 parameters.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, {
    stack: err.stack,
    body: req.body,
    user: req.user?.id,
  });

  // JSON syntax error from body-parser
  if (err.type === 'entity.parse.failed') {
    return sendError(res, { message: 'Invalid JSON in request body', statusCode: 400 });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  return sendError(res, { message, statusCode });
};

/**
 * Catches unmatched routes (404).
 */
const notFoundHandler = (req, res) => {
  return sendError(res, {
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    statusCode: 404,
  });
};

module.exports = { errorHandler, notFoundHandler };
