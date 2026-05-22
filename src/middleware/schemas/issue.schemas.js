const Joi = require('joi');

const CATEGORIES = ['roads', 'sanitation', 'water', 'electricity', 'parks', 'safety', 'other'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const locationSchema = Joi.object({
  address: Joi.string().trim().max(300).optional(),
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

const createIssueSchema = Joi.object({
  title: Joi.string().trim().min(5).max(200).required(),
  description: Joi.string().trim().min(10).max(5000).required(),
  category: Joi.string().valid(...CATEGORIES).required(),
  priority: Joi.string().valid(...PRIORITIES).default('medium'),
  location: locationSchema.optional(),
  attachments: Joi.array().items(Joi.string().uri()).max(10).default([]),
});

const listIssuesSchema = Joi.object({
  status: Joi.string().valid(...STATUSES).optional(),
  category: Joi.string().valid(...CATEGORIES).optional(),
  assignedTo: Joi.string().uuid().optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().min(Joi.ref('dateFrom')).optional(),
  // Geolocation radius filter
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
  radius: Joi.number().positive().max(500).optional(), // km
  // Pagination
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
}).and('lat', 'lng', 'radius'); // all three must be present together, or none

const updateStatusSchema = Joi.object({
  status: Joi.string().valid(...STATUSES).required(),
  note: Joi.string().trim().max(500).optional(),
});

const assignIssueSchema = Joi.object({
  officialId: Joi.string().uuid().required(),
  note: Joi.string().trim().max(500).optional(),
});

const issueIdParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

module.exports = {
  createIssueSchema,
  listIssuesSchema,
  updateStatusSchema,
  assignIssueSchema,
  issueIdParamSchema,
};
