/**
 * Integration Tests — SLA Engine
 *
 * Covers:
 *   GET  /api/issues/:id/sla
 *   GET  /api/admin/sla-config
 *   PATCH /api/admin/sla-config
 */

const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const registerAndLogin = async (role) => {
  const email = `${role}_sla_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
  await request(app).post('/api/auth/register').send({
    name: `SLA Test ${role}`,
    email,
    password: 'Secure123!',
    role,
  });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Secure123!' });
  return { token: res.body.data.accessToken, user: res.body.data.user };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const createIssue = async (citizenToken, category = 'water') => {
  const res = await request(app)
    .post('/api/issues')
    .set(auth(citizenToken))
    .send({
      title: `SLA test issue for ${category}`,
      description: 'Integration test issue to verify SLA calculation.',
      category,
      priority: 'high',
      location: { address: 'Test St', lat: 40.71, lng: -74.0 },
    });
  return res.body.data.issue;
};

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('SLA Engine', () => {
  let citizen, official, supervisor;
  let issue;

  beforeAll(async () => {
    [citizen, official, supervisor] = await Promise.all([
      registerAndLogin('citizen'),
      registerAndLogin('official'),
      registerAndLogin('supervisor'),
    ]);
    issue = await createIssue(citizen.token, 'water');
  });

  // ── GET /api/issues/:id/sla ──────────────────────────────────────────────
  describe('GET /api/issues/:id/sla', () => {
    it('returns SLA status for a valid issue', async () => {
      const res = await request(app)
        .get(`/api/issues/${issue.id}/sla`)
        .set(auth(citizen.token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const d = res.body.data;
      expect(d.issue_id).toBe(issue.id);
      expect(d.category).toBe('water');
      expect(d.sla_hours).toBe(12);          // default for water
      expect(typeof d.elapsed_hours).toBe('number');
      expect(typeof d.remaining_hours).toBe('number');
      expect(d.breach_at).toBeDefined();
      expect(['on_track', 'warning', 'breached', 'met']).toContain(d.status);
      expect(d.pct_elapsed).toBeGreaterThanOrEqual(0);
    });

    it('reflects "on_track" status for a brand-new issue', async () => {
      const res = await request(app)
        .get(`/api/issues/${issue.id}/sla`)
        .set(auth(citizen.token));
      // Fresh issue should be on_track (well within SLA window)
      expect(res.body.data.status).toBe('on_track');
    });

    it('returns 404 for a non-existent issue', async () => {
      const res = await request(app)
        .get('/api/issues/00000000-0000-0000-0000-000000000000/sla')
        .set(auth(supervisor.token));
      expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
      const res = await request(app).get(`/api/issues/${issue.id}/sla`);
      expect(res.status).toBe(401);
    });

    it('breach_at is correctly calculated from created_at + sla_hours', async () => {
      const res = await request(app)
        .get(`/api/issues/${issue.id}/sla`)
        .set(auth(citizen.token));

      const slaHours = res.body.data.sla_hours;
      const breachAt = new Date(res.body.data.breach_at);
      const createdAt = new Date(issue.createdAt);
      const expectedBreachMs = createdAt.getTime() + slaHours * 3_600_000;
      // Allow 5s drift for test timing
      expect(Math.abs(breachAt.getTime() - expectedBreachMs)).toBeLessThan(5000);
    });

    it('reflects "met" status after issue is resolved within SLA', async () => {
      // Resolve the issue (official)
      await request(app)
        .patch(`/api/issues/${issue.id}/status`)
        .set(auth(official.token))
        .send({ status: 'resolved', note: 'Fixed.' });

      const res = await request(app)
        .get(`/api/issues/${issue.id}/sla`)
        .set(auth(citizen.token));

      expect(res.body.data.status).toBe('met');
    });
  });

  // ── GET /api/admin/sla-config ─────────────────────────────────────────────
  describe('GET /api/admin/sla-config', () => {
    it('supervisor can list all SLA configs', async () => {
      const res = await request(app)
        .get('/api/admin/sla-config')
        .set(auth(supervisor.token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.configs)).toBe(true);
      expect(res.body.data.configs.length).toBe(7); // all 7 categories

      const waterConfig = res.body.data.configs.find((c) => c.category === 'water');
      expect(waterConfig).toBeDefined();
      expect(waterConfig.sla_hours).toBeGreaterThan(0);
    });

    it('official cannot access SLA config', async () => {
      const res = await request(app)
        .get('/api/admin/sla-config')
        .set(auth(official.token));
      expect(res.status).toBe(403);
    });

    it('citizen cannot access SLA config', async () => {
      const res = await request(app)
        .get('/api/admin/sla-config')
        .set(auth(citizen.token));
      expect(res.status).toBe(403);
    });

    it('unauthenticated request returns 401', async () => {
      const res = await request(app).get('/api/admin/sla-config');
      expect(res.status).toBe(401);
    });
  });

  // ── PATCH /api/admin/sla-config ───────────────────────────────────────────
  describe('PATCH /api/admin/sla-config', () => {
    it('supervisor can update SLA hours for a category', async () => {
      const res = await request(app)
        .patch('/api/admin/sla-config')
        .set(auth(supervisor.token))
        .send({ category: 'electricity', sla_hours: 8 });

      expect(res.status).toBe(200);
      expect(res.body.data.config.category).toBe('electricity');
      expect(res.body.data.config.sla_hours).toBe(8);
      expect(res.body.data.config.updated_by).toBe(supervisor.user.id);
    });

    it('updated SLA hours are reflected in new SLA queries', async () => {
      // Create a new electricity issue
      const elecIssue = await createIssue(citizen.token, 'electricity');

      const res = await request(app)
        .get(`/api/issues/${elecIssue.id}/sla`)
        .set(auth(citizen.token));

      expect(res.body.data.sla_hours).toBe(8); // reflects the update above
    });

    it('validates that sla_hours must be positive', async () => {
      const res = await request(app)
        .patch('/api/admin/sla-config')
        .set(auth(supervisor.token))
        .send({ category: 'roads', sla_hours: -1 });
      expect(res.status).toBe(422);
    });

    it('validates category enum', async () => {
      const res = await request(app)
        .patch('/api/admin/sla-config')
        .set(auth(supervisor.token))
        .send({ category: 'rockets', sla_hours: 10 });
      expect(res.status).toBe(422);
    });

    it('official cannot update SLA config', async () => {
      const res = await request(app)
        .patch('/api/admin/sla-config')
        .set(auth(official.token))
        .send({ category: 'roads', sla_hours: 24 });
      expect(res.status).toBe(403);
    });

    it('requires all fields', async () => {
      const res = await request(app)
        .patch('/api/admin/sla-config')
        .set(auth(supervisor.token))
        .send({ category: 'roads' }); // missing sla_hours
      expect(res.status).toBe(422);
    });
  });
});
