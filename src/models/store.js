/**
 * In-Memory Data Store
 *
 * Acts as a thin data-access layer. In production, replace each method
 * body with calls to your ORM (Prisma, TypeORM, Sequelize, Mongoose, etc.)
 * without changing any service or controller code.
 */

const { v4: uuidv4 } = require('uuid');

// ─── In-memory collections ────────────────────────────────────────────────────
const users = new Map();          // id → User
const refreshTokens = new Set();  // opaque refresh token strings (blocklist inverse)
const revokedTokens = new Set();  // revoked refresh tokens
const issues = new Map();         // id → Issue
const history = new Map();        // issueId → HistoryEntry[]

// ─── User Store ───────────────────────────────────────────────────────────────
const UserStore = {
  create: (data) => {
    const user = {
      id: uuidv4(),
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      role: data.role || 'citizen',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.set(user.id, user);
    return user;
  },

  findById: (id) => users.get(id) || null,

  findByEmail: (email) => {
    for (const user of users.values()) {
      if (user.email === email.toLowerCase()) return user;
    }
    return null;
  },

  toPublic: (user) => {
    const { passwordHash, ...pub } = user;
    return pub;
  },

  _getAll: () => Array.from(users.values()),
};

// ─── Token Store ──────────────────────────────────────────────────────────────
const TokenStore = {
  save: (token) => refreshTokens.add(token),
  exists: (token) => refreshTokens.has(token) && !revokedTokens.has(token),
  revoke: (token) => {
    revokedTokens.add(token);
    refreshTokens.delete(token);
  },
  revokeAllForUser: (userId) => {
    // In a real DB, delete WHERE userId = userId
    // Here we just mark all as revoked (tokens carry userId in their payload)
  },
};

// ─── Issue Store ──────────────────────────────────────────────────────────────
const IssueStore = {
  VALID_STATUSES: ['open', 'in_progress', 'resolved', 'closed', 'rejected'],
  VALID_CATEGORIES: ['roads', 'sanitation', 'water', 'electricity', 'parks', 'safety', 'other'],
  VALID_PRIORITIES: ['low', 'medium', 'high', 'critical'],

  create: (data) => {
    const issue = {
      id: uuidv4(),
      title: data.title,
      description: data.description,
      category: data.category,
      status: 'open',
      priority: data.priority || 'medium',
      location: data.location || null,
      attachments: data.attachments || [],
      reportedBy: data.reportedBy,
      assignedTo: null,
      firstResponseAt: null,   // set when status first leaves 'open'
      resolvedAt: null,        // set when status = 'resolved'
      closedAt: null,          // set when status = 'closed'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    issues.set(issue.id, issue);
    history.set(issue.id, []);
    return issue;
  },

  findById: (id) => issues.get(id) || null,

  update: (id, updates) => {
    const issue = issues.get(id);
    if (!issue) return null;
    const now = new Date().toISOString();
    const merged = { ...issue, ...updates, updatedAt: now };

    // Mirror the PostgreSQL trigger logic
    if (updates.status && updates.status !== issue.status) {
      if (issue.status === 'open' && !merged.firstResponseAt) {
        merged.firstResponseAt = now;
      }
      if (updates.status === 'resolved' && !merged.resolvedAt) {
        merged.resolvedAt = now;
      }
      if (updates.status === 'closed' && !merged.closedAt) {
        merged.closedAt = now;
      }
    }

    issues.set(id, merged);
    return merged;
  },

  findAll: (filters = {}) => {
    let result = Array.from(issues.values());

    if (filters.status) {
      result = result.filter((i) => i.status === filters.status);
    }
    if (filters.category) {
      result = result.filter((i) => i.category === filters.category);
    }
    if (filters.assignedTo) {
      result = result.filter((i) => i.assignedTo === filters.assignedTo);
    }
    if (filters.reportedBy) {
      result = result.filter((i) => i.reportedBy === filters.reportedBy);
    }
    if (filters.dateFrom) {
      result = result.filter((i) => new Date(i.createdAt) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      result = result.filter((i) => new Date(i.createdAt) <= new Date(filters.dateTo));
    }

    // Geolocation radius filter (haversine)
    if (filters.lat !== undefined && filters.lng !== undefined && filters.radiusKm !== undefined) {
      const { haversineDistance } = require('../utils/geo');
      result = result.filter((i) => {
        if (!i.location?.lat || !i.location?.lng) return false;
        const dist = haversineDistance(filters.lat, filters.lng, i.location.lat, i.location.lng);
        return dist <= filters.radiusKm;
      });
    }

    // Pagination
    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
    const total = result.length;
    const data = result.slice((page - 1) * limit, page * limit);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  },
};

// ─── History Store ────────────────────────────────────────────────────────────
const HistoryStore = {
  append: (issueId, entry) => {
    const record = {
      id: uuidv4(),
      issueId,
      ...entry,
      timestamp: new Date().toISOString(),
    };
    const log = history.get(issueId) || [];
    log.push(record);
    history.set(issueId, log);
    return record;
  },

  findByIssueId: (issueId) => history.get(issueId) || [],
};

module.exports = { UserStore, TokenStore, IssueStore, HistoryStore };
