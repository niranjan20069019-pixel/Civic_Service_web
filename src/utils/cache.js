/**
 * Redis Cache Utility
 *
 * Wraps ioredis with a simple get/set/del interface and a 5-minute default TTL.
 * Falls back gracefully when Redis is unavailable (cache miss = compute live).
 */

const Redis = require('ioredis');
const config = require('../config/env');
const logger = require('./logger');

const ANALYTICS_TTL_SECONDS = 5 * 60; // 5 minutes

let client = null;

/**
 * Lazily initialises the Redis client.
 * Returns null if REDIS_URL is not configured (cache disabled).
 */
function getClient() {
  if (client) return client;
  if (!config.redis.url) return null;

  client = new Redis(config.redis.url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000)),
  });

  client.on('error', (err) => logger.warn(`Redis error: ${err.message}`));
  client.on('connect', () => logger.info('Redis connected'));
  client.on('close', () => logger.warn('Redis connection closed'));

  return client;
}

/**
 * Attempts to retrieve a cached value.
 * Returns parsed JSON on hit, null on miss or error.
 *
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function cacheGet(key) {
  try {
    const c = getClient();
    if (!c) return null;
    const raw = await c.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn(`Cache GET failed for key "${key}": ${err.message}`);
    return null;
  }
}

/**
 * Stores a value in Redis with TTL.
 *
 * @param {string} key
 * @param {any} value  — must be JSON-serialisable
 * @param {number} [ttl=ANALYTICS_TTL_SECONDS]  — seconds
 */
async function cacheSet(key, value, ttl = ANALYTICS_TTL_SECONDS) {
  try {
    const c = getClient();
    if (!c) return;
    await c.setex(key, ttl, JSON.stringify(value));
  } catch (err) {
    logger.warn(`Cache SET failed for key "${key}": ${err.message}`);
  }
}

/**
 * Deletes one or more cache keys (e.g. after SLA config update).
 *
 * @param {...string} keys
 */
async function cacheDel(...keys) {
  try {
    const c = getClient();
    if (!c || keys.length === 0) return;
    await c.del(...keys);
  } catch (err) {
    logger.warn(`Cache DEL failed for keys ${keys.join(',')}: ${err.message}`);
  }
}

/**
 * Cache-aside helper.
 * Checks cache → on miss, calls `fn()`, stores result, returns it.
 *
 * @param {string} key
 * @param {() => Promise<any>} fn
 * @param {number} [ttl]
 */
async function withCache(key, fn, ttl = ANALYTICS_TTL_SECONDS) {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;

  const fresh = await fn();
  await cacheSet(key, fresh, ttl);
  return fresh;
}

// Cache key constants
const CACHE_KEYS = {
  SUMMARY:        'analytics:summary',
  BY_CATEGORY:    'analytics:by_category',
  BY_STATUS:      'analytics:by_status',
  RESPONSE_TIME:  (g) => `analytics:response_time:${g}`,
  HEATMAP:        'analytics:heatmap',
  SLA_CONFIG:     'sla:config',
};

module.exports = { cacheGet, cacheSet, cacheDel, withCache, CACHE_KEYS, ANALYTICS_TTL_SECONDS };
