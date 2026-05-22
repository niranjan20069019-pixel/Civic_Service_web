/**
 * SLA Service
 *
 * Computes SLA status for individual issues and drives the auto-escalation
 * logic called by the background cron job.
 */

const { IssueStore, HistoryStore, UserStore } = require('../models/store');
const { SLAStore } = require('../models/sla.store');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');

// Module-level event emitter so other parts of the app can subscribe
// to escalation events (e.g. for webhooks, email, push notifications).
const slaEvents = new EventEmitter();

const SLAService = {
  /**
   * Returns the SLA status object for a single issue.
   *
   * @param {string} issueId
   * @returns {{ category, sla_hours, elapsed_hours, breach_at, status }}
   */
  getIssueSLA(issueId) {
    const issue = IssueStore.findById(issueId);
    if (!issue) {
      const err = new Error('Issue not found.');
      err.statusCode = 404;
      throw err;
    }

    const config = SLAStore.getConfig(issue.category);
    if (!config) {
      const err = new Error(`No SLA config found for category: ${issue.category}`);
      err.statusCode = 500;
      throw err;
    }

    const createdAt = new Date(issue.createdAt);
    const now = new Date();
    const elapsedHours = (now - createdAt) / 3_600_000;
    const breachAt = new Date(createdAt.getTime() + config.sla_hours * 3_600_000);

    // Determine SLA compliance status
    let slaStatus;
    if (['resolved', 'closed'].includes(issue.status)) {
      const resolvedAt = new Date(issue.resolvedAt || issue.updatedAt);
      const resolvedElapsed = (resolvedAt - createdAt) / 3_600_000;
      slaStatus = resolvedElapsed <= config.sla_hours ? 'met' : 'breached';
    } else if (elapsedHours > config.sla_hours) {
      slaStatus = 'breached';
    } else if (elapsedHours / config.sla_hours > 0.8) {
      slaStatus = 'warning';   // >80% elapsed
    } else {
      slaStatus = 'on_track';
    }

    return {
      issue_id:      issue.id,
      category:      issue.category,
      issue_status:  issue.status,
      sla_hours:     config.sla_hours,
      elapsed_hours: +elapsedHours.toFixed(2),
      remaining_hours: +Math.max(0, config.sla_hours - elapsedHours).toFixed(2),
      breach_at:     breachAt.toISOString(),
      pct_elapsed:   +Math.min(100, (elapsedHours / config.sla_hours) * 100).toFixed(1),
      status:        slaStatus,
    };
  },

  /**
   * Called by the cron job every 15 minutes.
   * Scans all open/in-progress issues for SLA warnings and escalates them.
   *
   * Escalation = reassign to the first supervisor account + emit event + log history.
   */
  async runEscalationCheck() {
    logger.info('[SLA Cron] Running escalation check…');

    const { data: openIssues } = IssueStore.findAll({
      page: 1,
      limit: 1e6,
    });

    const activeIssues = openIssues.filter((i) =>
      ['open', 'in_progress'].includes(i.status)
    );

    // Find a supervisor to reassign to
    // In production this would query users WHERE role = 'supervisor' LIMIT 1
    const supervisorUser = _findAnySupervisor();

    let escalated = 0;

    for (const issue of activeIssues) {
      // Skip if already escalated
      if (SLAStore.wasEscalated(issue.id)) continue;

      const config = SLAStore.getConfig(issue.category);
      if (!config) continue;

      const createdAt = new Date(issue.createdAt);
      const now = new Date();
      const elapsedHours = (now - createdAt) / 3_600_000;
      const pctElapsed = elapsedHours / config.sla_hours;

      if (pctElapsed < 0.8) continue;   // Not yet in warning zone

      const breachAt = new Date(createdAt.getTime() + config.sla_hours * 3_600_000);

      logger.warn(
        `[SLA Cron] Escalating issue ${issue.id} (${issue.category}) — ` +
        `${(pctElapsed * 100).toFixed(1)}% elapsed`
      );

      // Reassign to supervisor if found
      if (supervisorUser) {
        IssueStore.update(issue.id, { assignedTo: supervisorUser.id });

        HistoryStore.append(issue.id, {
          action:           'sla_escalated',
          field:            'assignedTo',
          oldValue:         issue.assignedTo,
          newValue:         supervisorUser.id,
          performedBy:      supervisorUser.id,
          performedByName:  supervisorUser.name,
          performedByRole:  'supervisor',
          note:             `Auto-escalated: SLA ${(pctElapsed * 100).toFixed(1)}% elapsed`,
        });
      }

      // Record escalation event
      const event = SLAStore.recordEscalation({
        issueId:       issue.id,
        category:      issue.category,
        slaHours:      config.sla_hours,
        elapsedHours:  +elapsedHours.toFixed(2),
        breachAt:      breachAt.toISOString(),
        reassignedTo:  supervisorUser?.id || null,
        note:          `Auto-escalated by cron at ${(pctElapsed * 100).toFixed(1)}% SLA elapsed`,
      });

      // Emit for downstream subscribers
      slaEvents.emit('escalation', {
        issue,
        event,
        supervisor: supervisorUser,
      });

      escalated++;
    }

    logger.info(`[SLA Cron] Escalation check complete. Escalated: ${escalated}`);
    return { checked: activeIssues.length, escalated };
  },

  /**
   * Updates SLA hours for a category (supervisor only).
   *
   * @param {string} category
   * @param {number} slaHours
   * @param {string} updatedBy  — supervisor user ID
   */
  updateSLAConfig(category, slaHours, updatedBy) {
    const updated = SLAStore.updateConfig(category, slaHours, updatedBy);
    if (!updated) {
      const err = new Error(`Unknown category: ${category}`);
      err.statusCode = 422;
      throw err;
    }
    return updated;
  },

  /**
   * Returns all SLA config entries.
   */
  getAllSLAConfig() {
    return SLAStore.getAllConfig();
  },

  /** The event emitter, exposed so server.js can hook listeners. */
  events: slaEvents,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Finds any supervisor user in the store.
 * In production, query the DB: SELECT * FROM users WHERE role='supervisor' LIMIT 1
 */
function _findAnySupervisor() {
  const { UserStore } = require('../models/store');
  // UserStore has no role-based query, so iterate
  // This is acceptable for the in-memory implementation
  const users = UserStore._getAll ? UserStore._getAll() : [];
  return users.find((u) => u.role === 'supervisor') || null;
}

module.exports = SLAService;
