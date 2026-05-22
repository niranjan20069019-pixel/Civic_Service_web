const IssueService = require('../services/issue.service');
const { sendSuccess } = require('../utils/response');

const IssueController = {
  createIssue: async (req, res, next) => {
    try {
      const issue = await IssueService.createIssue(req.body, req.user);
      return sendSuccess(res, {
        message: 'Issue reported successfully.',
        data: { issue },
        statusCode: 201,
      });
    } catch (err) {
      return next(err);
    }
  },

  listIssues: async (req, res, next) => {
    try {
      const result = await IssueService.listIssues(req.query, req.user);
      return sendSuccess(res, {
        message: 'Issues retrieved.',
        data: result,
      });
    } catch (err) {
      return next(err);
    }
  },

  getIssueById: async (req, res, next) => {
    try {
      const issue = await IssueService.getIssueById(req.params.id, req.user);
      return sendSuccess(res, {
        message: 'Issue retrieved.',
        data: { issue },
      });
    } catch (err) {
      return next(err);
    }
  },

  updateStatus: async (req, res, next) => {
    try {
      const issue = await IssueService.updateStatus(req.params.id, req.body, req.user);
      return sendSuccess(res, {
        message: `Issue status updated to "${issue.status}".`,
        data: { issue },
      });
    } catch (err) {
      return next(err);
    }
  },

  assignIssue: async (req, res, next) => {
    try {
      const issue = await IssueService.assignIssue(req.params.id, req.body, req.user);
      return sendSuccess(res, {
        message: 'Issue assigned successfully.',
        data: { issue },
      });
    } catch (err) {
      return next(err);
    }
  },

  getIssueHistory: async (req, res, next) => {
    try {
      const history = await IssueService.getIssueHistory(req.params.id, req.user);
      return sendSuccess(res, {
        message: 'Issue history retrieved.',
        data: { history },
      });
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = IssueController;
