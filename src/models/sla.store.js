/**
 * SLA Store
 *
 * In-memory implementation of sla_config and sla_escalation_events tables.
 * In production, swap each method body for DB calls (same interface).
 */

const { v4: uuidv4 } = require('uuid');

// Default SLA hours per category (mirrors SQL seed data)
const DEFAULT_SLA_HOURS = {
  roads:       48,
  sanitation:  24,
  water:       12,
  electricity: 12,
  parks:       72,
  safety:       6,
  other:       48,
};

// sla_config table: category → { sla_hours, updatedBy, updatedAt }
const slaConfig = new Map(
  Object.entries(DEFAULT_SLA_HOURS).map(([cat, hours]) => [
    cat,
    { category: cat, sla_hours: hours, updated_by: null, updated_at: new Date().toISOString() },
  ])
);

// sla_escalation_events table
const escalationEvents = [];

const SLAStore = {
  /**
   * Returns the full SLA config map as an array.
   */
  getAllConfig() {
    return Array.from(slaConfig.values());
  },

  /**
   * Returns SLA config for a single category.
   * @param {string} category
   */
  getConfig(category) {
    return slaConfig.get(category) || null;
  },

  /**
   * Updates SLA hours for a category.
   * @param {string} category
   * @param {number} slaHours
   * @param {string} updatedBy  - user ID of the supervisor making the change
   */
  updateConfig(category, slaHours, updatedBy) {
    const existing = slaConfig.get(category);
    if (!existing) return null;
    const updated = {
      ...existing,
      sla_hours: slaHours,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };
    slaConfig.set(category, updated);
    return updated;
  },

  /**
   * Records an escalation event.
   */
  recordEscalation({ issueId, category, slaHours, elapsedHours, breachAt, reassignedTo, note }) {
    const event = {
      id: uuidv4(),
      issue_id: issueId,
      category,
      sla_hours: slaHours,
      elapsed_hours: elapsedHours,
      breach_at: breachAt,
      escalated_at: new Date().toISOString(),
      reassigned_to: reassignedTo || null,
      note: note || null,
    };
    escalationEvents.push(event);
    return event;
  },

  /**
   * Returns all escalation events (optionally filtered by issueId).
   */
  getEscalations(issueId = null) {
    if (issueId) return escalationEvents.filter((e) => e.issue_id === issueId);
    return [...escalationEvents];
  },

  /**
   * Checks if an issue has already been escalated (prevents duplicate escalations).
   * @param {string} issueId
   */
  wasEscalated(issueId) {
    return escalationEvents.some((e) => e.issue_id === issueId);
  },
};

module.exports = { SLAStore, DEFAULT_SLA_HOURS };
