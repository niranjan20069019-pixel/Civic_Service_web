const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Signs an access token (short-lived).
 */
const signAccessToken = (payload) => {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
    issuer: 'civic-platform',
  });
};

/**
 * Signs a refresh token (long-lived).
 */
const signRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
    issuer: 'civic-platform',
  });
};

/**
 * Verifies an access token. Throws if invalid or expired.
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.accessSecret, { issuer: 'civic-platform' });
};

/**
 * Verifies a refresh token. Throws if invalid or expired.
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret, { issuer: 'civic-platform' });
};

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
