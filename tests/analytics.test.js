/**
 * Integration Tests — Analytics Layer
 *
 * Covers all five public analytics endpoints:
 *   GET /api/analytics/summary
 *   GET /api/analytics/by-category
 *   GET /api/analytics/by-status
 *   GET /api/analytics/response-time
 *   GET /api/analytics/heatmap
 *
 * Endpoints are public (no auth required) but rate-limited.
 * Tests seed issues into the in-memory store and verify computed shapes.
 */

const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();

// ─── Test seed helpers ─────────────────────────────────────────────────────
const registerAndLogin = async (role) => {
  const email = `${role}_anl_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
  await request(app).post('/api/auth/register').send({
    name: `Analytics ${role}`,
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

const seedIssue = async (citizenToken, overrides = {}) => {
  const res = await request(app)
    .post('/api/issues')
    .set(auth(citizenToken))
    .send({
      title: 'Seeded analytics test issue',
      description: 'This issue is seeded for analytics endpoint testing.',
      category: 'roads',
      priority: 'medium',
      location: { address: '1 Test Ave', lat: 12.97, lng: 77.59 }, // Bengaluru coords
      ...overrides,
    });
  return res.body.data.issue;
};

// ─── Suite ─────────────────────────────────────────────────────────────────
describe('Analytics Endpoints', () => {
  let citizen, official;

  beforeAll(async () => {
    [citizen, official] = await Promise.all([
      registerAndLogin('citizen'),
      registerAndLogin('official'),
    ]);

    // Seed a mix of issues across categories and statuses
    const seeds = [
      { category: 'roads', priority: 'high' },
      { category: 'water', priority: 'critical', location: { lat: 12.98, lng: 77.60 } },
      { category: 'electricity', priority: 'medium', location: { lat: 12.96, lng: 77.58 } },
      { category: 'sanitation', priority: 'low', location: { lat: 12.97, lng: 77.61 } },
      { category: 'roads', priority: 'medium', location: { lat: 12.95, lng: 77.57 } },
    ];

    const seeded = [];
    for (const s of seeds) {
      const issue = await seedIssue(citizen.token, s);
      seeded.push(issue);
    }

    // Resolve two of them so resolved_pct > 0
    for (const issue of seeded.slice(0, 2)) {
      await request(app)
        .patch(`/api/issues/${issue.id}/status`)
        .set(auth(official.token))
        .send({ status: 'in_progress' });
      await request(app)
        .patch(`/api/issues/${issue.id}/status`)
        .set(auth(official.token))
        .send({ status: 'resolved' });
    }
  });

  // ── GET /api/analytics/summary ───────────────────────────────────────────
  describe('GET /api/analytics/summary', () => {
    it('returns 200 without authentication', async () => {
      const res = await request(app).get('/api/analytics/summary');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('contains required top-level fields', async () => {
      const res = await request(app).get('/api/analytics/summary');
      const d = res.body.data;
      expect(typeof d.total_issues).toBe('number');
      expect(typeof d.resolved_count).toBe('number');
      expect(typeof d.resolved_pct).toBe('number');
      expect(d.total_issues).toBeGreaterThan(0);
    });

    it('resolved_pct is between 0 and 100', async () => {
      const res = await request(app).get('/api/analytics/summary');
      expect(res.body.data.resolved_pct).toBeGreaterThanOrEqual(0);
      expect(res.body.data.resolved_pct).toBeLessThanOrEqual(100);
    });

    it('per_category array contains category objects', async () => {
      const res = await request(app).get('/api/analytics/summary');
      const cats = res.body.data.per_category;
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.length).toBeGreaterThan(0);
      const first = cats[0];
      expect(first.category).toBeDefined();
      expect(typeof first.total).toBe('number');
    });

    it('resolved_count <= total_issues', async () => {
      const res = await request(app).get('/api/analytics/summary');
      expect(res.body.data.resolved_count).toBeLessThanOrEqual(res.body.data.total_issues);
    });
  });

  // ── GET /api/analytics/by-category ───────────────────────────────────────
  describe('GET /api/analytics/by-category', () => {
    it('returns an array of category breakdowns', async () => {
      const res = await request(app).get('/api/analytics/by-category');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('each entry has the required shape', async () => {
      const res = await request(app).get('/api/analytics/by-category');
      const item = res.body.data[0];
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('total');
      expect(item).toHaveProperty('resolved_count');
      expect(item).toHaveProperty('resolved_pct');
      expect(item).toHaveProperty('avg_resolution_hours');
      expect(item).toHaveProperty('avg_first_response_hours');
    });

    it('contains seeded categories', async () => {
      const res = await request(app).get('/api/analytics/by-category');
      const cats = res.body.data.map((d) => d.category);
      expect(cats).toContain('roads');
      expect(cats).toContain('water');
    });

    it('is accessible without auth', async () => {
      const res = await request(app).get('/api/analytics/by-category');
      expect(res.status).toBe(200);
    });
  });

  // ── GET /api/analytics/by-status ─────────────────────────────────────────
  describe('GET /api/analytics/by-status', () => {
    it('returns the full status funnel array', async () => {
      const res = await request(app).get('/api/analytics/by-status');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('includes all five statuses', async () => {
      const res = await request(app).get('/api/analytics/by-status');
      const statuses = res.body.data.map((d) => d.status);
      ['open', 'in_progress', 'resolved', 'closed', 'rejected'].forEach((s) =>
        expect(statuses).toContain(s)
      );
    });

    it('resolved count > 0 after seeding resolved issues', async () => {
      const res = await request(app).get('/api/analytics/by-status');
      const resolved = res.body.data.find((d) => d.status === 'resolved');
      expect(resolved.total).toBeGreaterThan(0);
    });

    it('totals are non-negative integers', async () => {
      const res = await request(app).get('/api/analytics/by-status');
      res.body.data.forEach((d) => {
        expect(Number.isInteger(d.total)).toBe(true);
        expect(d.total).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ── GET /api/analytics/response-time ──────────────────────────────────────
  describe('GET /api/analytics/response-time', () => {
    it('returns daily time series by default', async () => {
      const res = await request(app).get('/api/analytics/response-time');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        expect(res.body.data[0].granularity).toBe('daily');
      }
    });

    it('returns weekly time series when requested', async () => {
      const res = await request(app).get('/api/analytics/response-time?granularity=weekly');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        expect(res.body.data[0].granularity).toBe('weekly');
      }
    });

    it('each entry has the required shape', async () => {
      const res = await request(app).get('/api/analytics/response-time');
      if (res.body.data.length === 0) return; // no data edge-case

      const item = res.body.data[0];
      expect(item).toHaveProperty('period');
      expect(item).toHaveProperty('granularity');
      expect(item).toHaveProperty('issues_created');
      expect(item).toHaveProperty('avg_first_response_hours');
      expect(item).toHaveProperty('avg_resolution_hours');
    });

    it('ignores unsupported granularity values (defaults to daily)', async () => {
      const res = await request(app).get('/api/analytics/response-time?granularity=monthly');
      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        expect(res.body.data[0].granularity).toBe('daily');
      }
    });

    it('is accessible without auth', async () => {
      const res = await request(app).get('/api/analytics/response-time');
      expect(res.status).toBe(200);
    });
  });

  // ── GET /api/analytics/heatmap ────────────────────────────────────────────
  describe('GET /api/analytics/heatmap', () => {
    it('returns a GeoJSON FeatureCollection', async () => {
      const res = await request(app).get('/api/analytics/heatmap');
      expect(res.status).toBe(200);
      const geo = res.body.data;
      expect(geo.type).toBe('FeatureCollection');
      expect(Array.isArray(geo.features)).toBe(true);
    });

    it('each feature has geometry and properties', async () => {
      const res = await request(app).get('/api/analytics/heatmap');
      const { features } = res.body.data;
      if (features.length === 0) return; // no geo data edge-case

      const f = features[0];
      expect(f.type).toBe('Feature');
      expect(f.geometry.type).toBe('Point');
      expect(Array.isArray(f.geometry.coordinates)).toBe(true);
      expect(f.geometry.coordinates).toHaveLength(2);
      expect(f.properties.issue_count).toBeGreaterThan(0);
      expect(Array.isArray(f.properties.categories)).toBe(true);
    });

    it('coordinates are [lng, lat] — GeoJSON standard', async () => {
      const res = await request(app).get('/api/analytics/heatmap');
      const { features } = res.body.data;
      if (features.length === 0) return;

      for (const f of features) {
        const [lng, lat] = f.geometry.coordinates;
        expect(lng).toBeGreaterThanOrEqual(-180);
        expect(lng).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
      }
    });

    it('is accessible without auth', async () => {
      const res = await request(app).get('/api/analytics/heatmap');
      expect(res.status).toBe(200);
    });
  });
});
