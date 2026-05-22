const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const { sendError } = require('../utils/response');

const createLimiter = (options) =>
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      sendError(res, {
        message: 'Too many requests. Please slow down and try again later.',
        statusCode: 429,
      }),
    ...options,
  });

/** General API rate limiter */
const apiLimiter = createLimiter({
  max: config.rateLimit.max,
  message: 'Too many requests from this IP.',
});

/** Stricter limiter for auth endpoints to deter brute force */
const authLimiter = createLimiter({
  max: config.rateLimit.authMax,
  windowMs: 15 * 60 * 1000, // always 15 min for auth
  skipSuccessfulRequests: true, // only count failed attempts
});

/** Analytics endpoints — public but rate-limited (30 req / 15 min) */
const analyticsLimiter = createLimiter({
  max: parseInt(process.env.ANALYTICS_RATE_LIMIT_MAX, 10) || 30,
  windowMs: 15 * 60 * 1000,
});

module.exports = { apiLimiter, authLimiter, analyticsLimiter };
