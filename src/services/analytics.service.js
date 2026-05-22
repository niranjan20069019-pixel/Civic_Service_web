/**
 * Analytics Service
 *
 * Wraps AnalyticsStore with Redis cache-aside (5-minute TTL).
 * All methods are intentionally stateless so the caching layer
 * can be swapped out or bypassed in tests without side-effects.
 */

const { AnalyticsStore } = require('../models/analytics.store');
const { withCache, CACHE_KEYS } = require('../utils/cache');

const AnalyticsService = {
  /**
   * Overall summary: totals, resolved %, avg resolution time.
   */
  async getSummary() {
    return withCache(CACHE_KEYS.SUMMARY, () => Promise.resolve(AnalyticsStore.getSummary()));
  },

  /**
   * Per-category count and avg resolution time.
   */
  async getByCategory() {
    return withCache(CACHE_KEYS.BY_CATEGORY, () => Promise.resolve(AnalyticsStore.getByCategory()));
  },

  /**
   * Status funnel: open → in_progress → resolved → closed → rejected.
   */
  async getByStatus() {
    return withCache(CACHE_KEYS.BY_STATUS, () => Promise.resolve(AnalyticsStore.getByStatus()));
  },

  /**
   * Daily or weekly time-series of first-response and resolution times.
   *
   * @param {'daily'|'weekly'} granularity
   */
  async getResponseTimeSeries(granularity = 'daily') {
    const key = CACHE_KEYS.RESPONSE_TIME(granularity);
    return withCache(key, () =>
      Promise.resolve(AnalyticsStore.getResponseTimeSeries(granularity))
    );
  },

  /**
   * GeoJSON FeatureCollection of issue cluster centroids (heatmap data).
   */
  async getHeatmap() {
    return withCache(CACHE_KEYS.HEATMAP, () => Promise.resolve(AnalyticsStore.getHeatmap()));
  },
};

module.exports = AnalyticsService;
