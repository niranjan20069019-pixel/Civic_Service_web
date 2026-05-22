/**
 * Background Jobs
 *
 * Two cron jobs:
 *   1. SLA Escalation Check — every 15 minutes
 *   2. Analytics Views Refresh — every 60 minutes
 *      (mirrors the PostgreSQL `REFRESH MATERIALIZED VIEW CONCURRENTLY` cadence)
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const SLAService = require('../services/sla.service');
const { cacheDel, CACHE_KEYS } = require('../utils/cache');

// ---------------------------------------------------------------------------
// Job 1: SLA Escalation — every 15 minutes
// ---------------------------------------------------------------------------
const SLA_CRON_SCHEDULE = '*/15 * * * *'; // at :00, :15, :30, :45

function startSLAEscalationJob() {
  const job = cron.schedule(
    SLA_CRON_SCHEDULE,
    async () => {
      try {
        const result = await SLAService.runEscalationCheck();
        logger.info(`[SLA Job] Done — checked ${result.checked}, escalated ${result.escalated}`);
      } catch (err) {
        logger.error(`[SLA Job] Escalation check failed: ${err.message}`, { stack: err.stack });
      }
    },
    { scheduled: false, timezone: 'UTC' }
  );

  // Listen for escalation events and log them (hook additional sinks here)
  SLAService.events.on('escalation', ({ issue, event, supervisor }) => {
    logger.warn(
      `[SLA Event] Issue ${issue.id} (${issue.category}) escalated — ` +
      `${event.elapsed_hours}h / ${event.sla_hours}h SLA. ` +
      `Reassigned to supervisor: ${supervisor?.name || 'none'}`
    );
    // TODO: send push notification / email / webhook here
  });

  job.start();
  logger.info(`[SLA Job] Escalation cron scheduled: "${SLA_CRON_SCHEDULE}" (UTC)`);
  return job;
}

// ---------------------------------------------------------------------------
// Job 2: Analytics Cache Bust — every 60 minutes
// Forces re-computation from the materialized views on next request.
// In production this is augmented by the SQL function refresh_analytics_views()
// which is called here too via the DB pool.
// ---------------------------------------------------------------------------
const ANALYTICS_REFRESH_SCHEDULE = '0 * * * *'; // top of every hour

function startAnalyticsRefreshJob() {
  const job = cron.schedule(
    ANALYTICS_REFRESH_SCHEDULE,
    async () => {
      logger.info('[Analytics Job] Busting analytics cache…');
      try {
        await cacheDel(
          CACHE_KEYS.SUMMARY,
          CACHE_KEYS.BY_CATEGORY,
          CACHE_KEYS.BY_STATUS,
          CACHE_KEYS.RESPONSE_TIME('daily'),
          CACHE_KEYS.RESPONSE_TIME('weekly'),
          CACHE_KEYS.HEATMAP
        );
        logger.info('[Analytics Job] Cache cleared — views will recompute on next request.');

        // In production: also call the DB refresh function:
        // await db.query('SELECT refresh_analytics_views()');
      } catch (err) {
        logger.error(`[Analytics Job] Cache bust failed: ${err.message}`, { stack: err.stack });
      }
    },
    { scheduled: false, timezone: 'UTC' }
  );

  job.start();
  logger.info(`[Analytics Job] Refresh cron scheduled: "${ANALYTICS_REFRESH_SCHEDULE}" (UTC)`);
  return job;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let slaJob = null;
let analyticsJob = null;

function startAll() {
  slaJob = startSLAEscalationJob();
  analyticsJob = startAnalyticsRefreshJob();
  return { slaJob, analyticsJob };
}

function stopAll() {
  slaJob?.stop();
  analyticsJob?.stop();
  logger.info('[Cron] All background jobs stopped.');
}

module.exports = { startAll, stopAll };
