const bcrypt = require('bcryptjs');
const { UserStore, TokenStore } = require('../models/store');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');

const BCRYPT_ROUNDS = 12;

const AuthService = {
  /**
   * Registers a new user. Rejects if email already exists.
   */
  register: async ({ name, email, password, role }) => {
    const existing = UserStore.findByEmail(email);
    if (existing) {
      const err = new Error('An account with that email already exists.');
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = UserStore.create({ name, email, passwordHash, role });
    return UserStore.toPublic(user);
  },

  /**
   * Validates credentials and returns a token pair.
   */
  login: async ({ email, password }) => {
    const user = UserStore.findByEmail(email);
    if (!user) {
      const err = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const err = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    const payload = { sub: user.id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    TokenStore.save(refreshToken);

    return { accessToken, refreshToken, user: UserStore.toPublic(user) };
  },

  /**
   * Issues a new access token given a valid refresh token.
   */
  refresh: async ({ refreshToken }) => {
    if (!TokenStore.exists(refreshToken)) {
      const err = new Error('Refresh token is invalid or has been revoked.');
      err.statusCode = 401;
      throw err;
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      TokenStore.revoke(refreshToken);
      const err = new Error('Refresh token is expired or malformed.');
      err.statusCode = 401;
      throw err;
    }

    const user = UserStore.findById(payload.sub);
    if (!user) {
      const err = new Error('User no longer exists.');
      err.statusCode = 401;
      throw err;
    }

    // Rotate: revoke old, issue new pair
    TokenStore.revoke(refreshToken);
    const newPayload = { sub: user.id, role: user.role };
    const accessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);
    TokenStore.save(newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken };
  },

  /**
   * Revokes a refresh token (logout).
   */
  logout: async ({ refreshToken }) => {
    if (TokenStore.exists(refreshToken)) {
      TokenStore.revoke(refreshToken);
    }
    // Silently succeed even if token wasn't found (idempotent)
  },
};

module.exports = AuthService;
