/**
 * Analytics Controller
 *
 * All endpoints are public (no auth) but rate-limited.
 * Caching is handled inside AnalyticsService.
 */

const AnalyticsService = require('../services/analytics.service');
const { sendSuccess } = require('../utils/response');

const AnalyticsController = {
  /**
   * GET /api/analytics/summary
   */
  summary: async (req, res, next) => {
    try {
      const data = await AnalyticsService.getSummary();
      return sendSuccess(res, { message: 'Analytics summary retrieved.', data });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/analytics/by-category
   */
  byCategory: async (req, res, next) => {
    try {
      const data = await AnalyticsService.getByCategory();
      return sendSuccess(res, { message: 'Category breakdown retrieved.', data });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/analytics/by-status
   */
  byStatus: async (req, res, next) => {
    try {
      const data = await AnalyticsService.getByStatus();
      return sendSuccess(res, { message: 'Status funnel retrieved.', data });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/analytics/response-time?granularity=daily|weekly
   */
  responseTime: async (req, res, next) => {
    try {
      const granularity = req.query.granularity === 'weekly' ? 'weekly' : 'daily';
      const data = await AnalyticsService.getResponseTimeSeries(granularity);
      return sendSuccess(res, { message: 'Response time series retrieved.', data });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/analytics/heatmap
   */
  heatmap: async (req, res, next) => {
    try {
      const data = await AnalyticsService.getHeatmap();
      // Return raw GeoJSON (still wrapped in the standard envelope)
      return sendSuccess(res, { message: 'Heatmap data retrieved.', data });
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = AnalyticsController;
