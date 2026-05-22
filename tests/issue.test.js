const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const registerAndLogin = async (role) => {
  const email = `${role}_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
  await request(app).post('/api/auth/register').send({
    name: `Test ${role}`,
    email,
    password: 'Secure123!',
    role,
  });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Secure123!' });
  return { token: res.body.data.accessToken, user: res.body.data.user };
};

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Issue Endpoints', () => {
  let citizen, official, supervisor;
  let issueId;

  beforeAll(async () => {
    [citizen, official, supervisor] = await Promise.all([
      registerAndLogin('citizen'),
      registerAndLogin('official'),
      registerAndLogin('supervisor'),
    ]);
  });

  describe('POST /api/issues', () => {
    it('citizen creates an issue', async () => {
      const res = await request(app)
        .post('/api/issues')
        .set(authHeader(citizen.token))
        .send({
          title: 'Broken streetlight on Elm Ave',
          description: 'The streetlight at 45 Elm Ave has been out for a week, creating safety risks.',
          category: 'electricity',
          priority: 'high',
          location: { address: '45 Elm Ave', lat: 40.7128, lng: -74.006 },
        });
      expect(res.status).toBe(201);
      expect(res.body.data.issue.status).toBe('open');
      issueId = res.body.data.issue.id;
    });

    it('official cannot create an issue', async () => {
      const res = await request(app)
        .post('/api/issues')
        .set(authHeader(official.token))
        .send({
          title: 'Another issue',
          description: 'This should be rejected by RBAC middleware.',
          category: 'roads',
        });
      expect(res.status).toBe(403);
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/issues')
        .set(authHeader(citizen.token))
        .send({ title: 'x' }); // too short
      expect(res.status).toBe(422);
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).post('/api/issues').send({ title: 'No auth' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/issues', () => {
    it('citizen only sees their own issues', async () => {
      const res = await request(app).get('/api/issues').set(authHeader(citizen.token));
      expect(res.status).toBe(200);
      res.body.data.data.forEach((i) => expect(i.reportedBy).toBe(citizen.user.id));
    });

    it('supervisor sees all issues', async () => {
      const res = await request(app).get('/api/issues').set(authHeader(supervisor.token));
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBeGreaterThan(0);
    });

    it('filters by category', async () => {
      const res = await request(app)
        .get('/api/issues?category=electricity')
        .set(authHeader(supervisor.token));
      expect(res.status).toBe(200);
      res.body.data.data.forEach((i) => expect(i.category).toBe('electricity'));
    });

    it('returns paginated results', async () => {
      const res = await request(app)
        .get('/api/issues?page=1&limit=5')
        .set(authHeader(supervisor.token));
      expect(res.status).toBe(200);
      expect(res.body.data.limit).toBe(5);
    });
  });

  describe('GET /api/issues/:id', () => {
    it('returns issue with timeline', async () => {
      const res = await request(app)
        .get(`/api/issues/${issueId}`)
        .set(authHeader(citizen.token));
      expect(res.status).toBe(200);
      expect(res.body.data.issue.timeline).toBeDefined();
      expect(res.body.data.issue.timeline.length).toBeGreaterThan(0);
    });

    it('returns 404 for non-existent id', async () => {
      const res = await request(app)
        .get('/api/issues/00000000-0000-0000-0000-000000000000')
        .set(authHeader(supervisor.token));
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/issues/:id/status', () => {
    it('official updates issue status', async () => {
      const res = await request(app)
        .patch(`/api/issues/${issueId}/status`)
        .set(authHeader(official.token))
        .send({ status: 'in_progress', note: 'Crew dispatched.' });
      expect(res.status).toBe(200);
      expect(res.body.data.issue.status).toBe('in_progress');
    });

    it('citizen cannot update status', async () => {
      const res = await request(app)
        .patch(`/api/issues/${issueId}/status`)
        .set(authHeader(citizen.token))
        .send({ status: 'resolved' });
      expect(res.status).toBe(403);
    });

    it('rejects same status (idempotency conflict)', async () => {
      const res = await request(app)
        .patch(`/api/issues/${issueId}/status`)
        .set(authHeader(official.token))
        .send({ status: 'in_progress' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/issues/:id/assign', () => {
    it('supervisor assigns to official', async () => {
      const res = await request(app)
        .post(`/api/issues/${issueId}/assign`)
        .set(authHeader(supervisor.token))
        .send({ officialId: official.user.id });
      expect(res.status).toBe(200);
      expect(res.body.data.issue.assignedTo).toBe(official.user.id);
    });

    it('official cannot assign issues', async () => {
      const res = await request(app)
        .post(`/api/issues/${issueId}/assign`)
        .set(authHeader(official.token))
        .send({ officialId: official.user.id });
      expect(res.status).toBe(403);
    });

    it('rejects assigning to non-official user', async () => {
      const res = await request(app)
        .post(`/api/issues/${issueId}/assign`)
        .set(authHeader(supervisor.token))
        .send({ officialId: citizen.user.id }); // citizen is not an official
      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/issues/:id/history', () => {
    it('returns full audit trail', async () => {
      const res = await request(app)
        .get(`/api/issues/${issueId}/history`)
        .set(authHeader(supervisor.token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.history)).toBe(true);
      // Should have: created + status_changed + assigned
      expect(res.body.data.history.length).toBeGreaterThanOrEqual(3);
    });

    it('citizen can view their own issue history', async () => {
      const res = await request(app)
        .get(`/api/issues/${issueId}/history`)
        .set(authHeader(citizen.token));
      expect(res.status).toBe(200);
    });
  });
});
