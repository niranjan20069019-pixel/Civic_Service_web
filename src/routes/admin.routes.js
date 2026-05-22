/**
 * Admin Routes — SLA Configuration
 *
 * All routes require authentication + supervisor role.
 */

const { Router } = require('express');
const SLAController = require('../controllers/sla.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { updateSLAConfigSchema } = require('../middleware/schemas/sla.schemas');

const router = Router();

router.use(authenticate, authorize('supervisor'));

/**
 * @swagger
 * /admin/sla-config:
 *   get:
 *     tags: [Admin]
 *     summary: List all SLA configurations
 *     description: Returns the full SLA config table (supervisor only).
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: SLA config list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         configs:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/SLAConfig'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a supervisor)
 */
router.get('/sla-config', SLAController.listConfig);

/**
 * @swagger
 * /admin/sla-config:
 *   patch:
 *     tags: [Admin]
 *     summary: Update SLA hours for a category
 *     description: |
 *       Supervisor-only. Updates the SLA (service-level agreement) hours for a specific
 *       issue category. The background cron uses these values to detect and escalate
 *       approaching breaches (>80% elapsed).
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, sla_hours]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [roads, sanitation, water, electricity, parks, safety, other]
 *                 example: water
 *               sla_hours:
 *                 type: number
 *                 minimum: 0.5
 *                 maximum: 8760
 *                 example: 8
 *                 description: New SLA target in hours
 *     responses:
 *       200:
 *         description: SLA config updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         config:
 *                           $ref: '#/components/schemas/SLAConfig'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a supervisor)
 *       422:
 *         description: Validation error or unknown category
 */
router.patch('/sla-config', validate(updateSLAConfigSchema), SLAController.updateConfig);

module.exports = router;
