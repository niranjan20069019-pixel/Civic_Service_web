const { verifyAccessToken } = require('../utils/jwt');
const { UserStore } = require('../models/store');
const { sendError } = require('../utils/response');

/**
 * Authenticates the request by verifying the Bearer access token.
 * Attaches `req.user` on success.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, {
        message: 'Authorization header missing or malformed. Expected: Bearer <token>',
        statusCode: 401,
      });
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    const user = UserStore.findById(payload.sub);
    if (!user) {
      return sendError(res, { message: 'User associated with token no longer exists', statusCode: 401 });
    }

    req.user = UserStore.toPublic(user);
    return next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Access token has expired. Please refresh your session.'
        : 'Invalid access token.';
    return sendError(res, { message, statusCode: 401 });
  }
};

/**
 * RBAC middleware factory.
 * Pass one or more allowed roles; denies with 403 if the authenticated
 * user's role is not in the list.
 *
 * Usage: authorize('supervisor')  |  authorize('official', 'supervisor')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, { message: 'Not authenticated', statusCode: 401 });
    }
    if (!roles.includes(req.user.role)) {
      return sendError(res, {
        message: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}`,
        statusCode: 403,
      });
    }
    return next();
  };
};

module.exports = { authenticate, authorize };
