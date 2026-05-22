const AuthService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../utils/response');
const logger = require('../utils/logger');

const AuthController = {
  register: async (req, res, next) => {
    try {
      const user = await AuthService.register(req.body);
      logger.info(`New user registered: ${user.email} (${user.role})`);
      return sendSuccess(res, {
        message: 'Account created successfully.',
        data: { user },
        statusCode: 201,
      });
    } catch (err) {
      return next(err);
    }
  },

  login: async (req, res, next) => {
    try {
      const { accessToken, refreshToken, user } = await AuthService.login(req.body);
      logger.info(`User logged in: ${user.email}`);
      return sendSuccess(res, {
        message: 'Login successful.',
        data: { accessToken, refreshToken, user },
      });
    } catch (err) {
      return next(err);
    }
  },

  refresh: async (req, res, next) => {
    try {
      const tokens = await AuthService.refresh(req.body);
      return sendSuccess(res, {
        message: 'Tokens refreshed.',
        data: tokens,
      });
    } catch (err) {
      return next(err);
    }
  },

  logout: async (req, res, next) => {
    try {
      await AuthService.logout(req.body);
      return sendSuccess(res, { message: 'Logged out successfully.' });
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = AuthController;
