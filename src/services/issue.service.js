const { IssueStore, HistoryStore, UserStore } = require('../models/store');

const IssueService = {
  /**
   * Creates a new civic issue on behalf of a citizen.
   */
  createIssue: async (data, reportedBy) => {
    const issue = IssueStore.create({ ...data, reportedBy: reportedBy.id });

    HistoryStore.append(issue.id, {
      action: 'created',
      field: null,
      oldValue: null,
      newValue: 'open',
      performedBy: reportedBy.id,
      performedByName: reportedBy.name,
      performedByRole: reportedBy.role,
      note: 'Issue created',
    });

    return issue;
  },

  /**
   * Returns a paginated, filtered list of issues.
   * Citizens only see their own issues; officials/supervisors see all.
   */
  listIssues: async (filters, user) => {
    const effectiveFilters = { ...filters };

    if (user.role === 'citizen') {
      effectiveFilters.reportedBy = user.id;
    }

    // Parse geolocation filters
    if (filters.lat !== undefined) effectiveFilters.lat = parseFloat(filters.lat);
    if (filters.lng !== undefined) effectiveFilters.lng = parseFloat(filters.lng);
    if (filters.radius !== undefined) effectiveFilters.radiusKm = parseFloat(filters.radius);

    return IssueStore.findAll(effectiveFilters);
  },

  /**
   * Returns a single issue with its timeline.
   * Citizens can only view issues they reported.
   */
  getIssueById: async (issueId, user) => {
    const issue = IssueStore.findById(issueId);
    if (!issue) {
      const err = new Error('Issue not found.');
      err.statusCode = 404;
      throw err;
    }

    if (user.role === 'citizen' && issue.reportedBy !== user.id) {
      const err = new Error('You do not have permission to view this issue.');
      err.statusCode = 403;
      throw err;
    }

    const timeline = HistoryStore.findByIssueId(issueId);
    return { ...issue, timeline };
  },

  /**
   * Updates the status of an issue (official or supervisor).
   */
  updateStatus: async (issueId, { status, note }, user) => {
    const issue = IssueStore.findById(issueId);
    if (!issue) {
      const err = new Error('Issue not found.');
      err.statusCode = 404;
      throw err;
    }

    if (issue.status === status) {
      const err = new Error(`Issue is already in ${status} status.`);
      err.statusCode = 409;
      throw err;
    }

    const oldStatus = issue.status;
    const updated = IssueStore.update(issueId, { status });

    HistoryStore.append(issueId, {
      action: 'status_changed',
      field: 'status',
      oldValue: oldStatus,
      newValue: status,
      performedBy: user.id,
      performedByName: user.name,
      performedByRole: user.role,
      note: note || null,
    });

    return updated;
  },

  /**
   * Assigns an issue to an official (supervisor only).
   */
  assignIssue: async (issueId, { officialId, note }, user) => {
    const issue = IssueStore.findById(issueId);
    if (!issue) {
      const err = new Error('Issue not found.');
      err.statusCode = 404;
      throw err;
    }

    const official = UserStore.findById(officialId);
    if (!official) {
      const err = new Error('Official not found.');
      err.statusCode = 404;
      throw err;
    }
    if (official.role !== 'official') {
      const err = new Error(`User ${officialId} is not an official (role: ${official.role}).`);
      err.statusCode = 422;
      throw err;
    }

    const oldAssignee = issue.assignedTo;
    const updated = IssueStore.update(issueId, {
      assignedTo: officialId,
      status: issue.status === 'open' ? 'in_progress' : issue.status,
    });

    HistoryStore.append(issueId, {
      action: 'assigned',
      field: 'assignedTo',
      oldValue: oldAssignee,
      newValue: officialId,
      performedBy: user.id,
      performedByName: user.name,
      performedByRole: user.role,
      note: note || `Assigned to ${official.name}`,
    });

    return { ...updated, assignedToName: official.name };
  },

  /**
   * Returns the full audit trail for an issue.
   */
  getIssueHistory: async (issueId, user) => {
    const issue = IssueStore.findById(issueId);
    if (!issue) {
      const err = new Error('Issue not found.');
      err.statusCode = 404;
      throw err;
    }

    if (user.role === 'citizen' && issue.reportedBy !== user.id) {
      const err = new Error('You do not have permission to view this issue history.');
      err.statusCode = 403;
      throw err;
    }

    return HistoryStore.findByIssueId(issueId);
  },
};

module.exports = IssueService;
