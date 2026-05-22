/**
 * Analytics Routes — Public Transparency Dashboard
 *
 * All endpoints are public (no auth required).
 * Protected by a dedicated rate limiter (30 req / 15 min per IP).
 */

const { Router } = require('express');
const AnalyticsController = require('../controllers/analytics.controller');
const { analyticsLimiter } = require('../middleware/rateLimiter');

const router = Router();

// Apply analytics-specific rate limiter to all routes in this file
router.use(analyticsLimiter);

/**
 * @swagger
 * /analytics/summary:
 *   get:
 *     tags: [Analytics]
 *     summary: Overall issue summary
 *     description: |
 *       Returns aggregated totals, resolved percentage, and average resolution time,
 *       overall and broken down per category.
 *       Results are cached for 5 minutes.
 *     responses:
 *       200:
 *         description: Summary data
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AnalyticsSummary'
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/summary', AnalyticsController.summary);

/**
 * @swagger
 * /analytics/by-category:
 *   get:
 *     tags: [Analytics]
 *     summary: Issue counts and resolution times per category
 *     description: Cached for 5 minutes.
 *     responses:
 *       200:
 *         description: Per-category breakdown
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CategoryBreakdown'
 */
router.get('/by-category', AnalyticsController.byCategory);

/**
 * @swagger
 * /analytics/by-status:
 *   get:
 *     tags: [Analytics]
 *     summary: Status funnel breakdown
 *     description: |
 *       Returns counts for every status: open → in_progress → resolved → closed → rejected.
 *       Cached for 5 minutes.
 *     responses:
 *       200:
 *         description: Status funnel
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           total:
 *                             type: integer
 */
router.get('/by-status', AnalyticsController.byStatus);

/**
 * @swagger
 * /analytics/response-time:
 *   get:
 *     tags: [Analytics]
 *     summary: Time-series of first-response and resolution times
 *     description: |
 *       Returns daily or weekly averages. Defaults to daily.
 *       Cached for 5 minutes per granularity.
 *     parameters:
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [daily, weekly]
 *           default: daily
 *         description: Aggregation window
 *     responses:
 *       200:
 *         description: Time-series data
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ResponseTimeSeries'
 */
router.get('/response-time', AnalyticsController.responseTime);

/**
 * @swagger
 * /analytics/heatmap:
 *   get:
 *     tags: [Analytics]
 *     summary: GeoJSON heatmap of issue clusters
 *     description: |
 *       Returns a GeoJSON FeatureCollection where each Feature is a cluster centroid
 *       computed via ST_ClusterKMeans (PostgreSQL) or k-means (in-memory).
 *       Each feature carries `issue_count` and `categories` properties.
 *       Cached for 5 minutes.
 *     responses:
 *       200:
 *         description: GeoJSON FeatureCollection
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/GeoJSONFeatureCollection'
 */
router.get('/heatmap', AnalyticsController.heatmap);

module.exports = router;
