/**
 * SLA Controller
 *
 * Handles:
 *   PATCH /api/admin/sla-config          — update SLA hours (supervisor)
 *   GET   /api/admin/sla-config          — list all SLA configs (supervisor)
 *   GET   /api/issues/:id/sla            — SLA status for a single issue (authenticated)
 */

const SLAService = require('../services/sla.service');
const { cacheDel, CACHE_KEYS } = require('../utils/cache');
const { sendSuccess } = require('../utils/response');

const SLAController = {
  /**
   * GET /api/admin/sla-config
   * Returns full SLA config table.
   */
  listConfig: async (req, res, next) => {
    try {
      const configs = SLAService.getAllSLAConfig();
      return sendSuccess(res, {
        message: 'SLA configuration retrieved.',
        data: { configs },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * PATCH /api/admin/sla-config
   * Body: { category: string, sla_hours: number }
   * Updates SLA hours for a category and invalidates the SLA config cache.
   */
  updateConfig: async (req, res, next) => {
    try {
      const { category, sla_hours } = req.body;
      const updated = SLAService.updateSLAConfig(category, sla_hours, req.user.id);

      // Invalidate cached SLA config
      await cacheDel(CACHE_KEYS.SLA_CONFIG);

      return sendSuccess(res, {
        message: `SLA for category "${category}" updated to ${sla_hours} hours.`,
        data: { config: updated },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/issues/:id/sla
   * Returns SLA status for a specific issue.
   */
  getIssueSLA: async (req, res, next) => {
    try {
      const sla = SLAService.getIssueSLA(req.params.id);
      return sendSuccess(res, {
        message: 'SLA status retrieved.',
        data: sla,
      });
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = SLAController;
