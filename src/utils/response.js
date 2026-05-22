/**
 * Sends a consistent success response envelope.
 * Shape: { success, message, data, errors: null }
 */
const sendSuccess = (res, { message = 'Success', data = null, statusCode = 200 } = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    errors: null,
  });
};

/**
 * Sends a consistent error response envelope.
 * Shape: { success: false, message, data: null, errors }
 */
const sendError = (res, { message = 'An error occurred', errors = null, statusCode = 400 } = {}) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    errors,
  });
};

module.exports = { sendSuccess, sendError };
