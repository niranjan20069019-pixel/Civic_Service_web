const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();

const testUser = {
  name: 'Test Citizen',
  email: `citizen_${Date.now()}@test.com`,
  password: 'Secure123!',
  role: 'citizen',
};

let accessToken;
let refreshToken;

describe('Auth Endpoints', () => {
  describe('POST /api/auth/register', () => {
    it('registers a new user', async () => {
      const res = await request(app).post('/api/auth/register').send(testUser);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('rejects duplicate email', async () => {
      const res = await request(app).post('/api/auth/register').send(testUser);
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('validates required fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'bad' });
      expect(res.status).toBe(422);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns token pair on valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('rejects wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'WrongPass99!' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rotates tokens', async () => {
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Update tokens for subsequent tests
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('rejects a revoked refresh token', async () => {
      // Login fresh to get tokens, then try to use old refresh token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      const oldRefresh = loginRes.body.data.refreshToken;
      // Rotate once
      await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
      // Try to use it again
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes refresh token', async () => {
      const res = await request(app).post('/api/auth/logout').send({ refreshToken });
      expect(res.status).toBe(200);
    });
  });
});
