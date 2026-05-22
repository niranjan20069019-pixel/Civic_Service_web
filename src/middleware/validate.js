const { sendError } = require('../utils/response');

/**
 * Factory that returns an Express middleware validating req[target] against a Joi schema.
 *
 * @param {import('joi').Schema} schema
 * @param {'body'|'query'|'params'} [target='body']
 */
const validate = (schema, target = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return sendError(res, { message: 'Validation failed', errors, statusCode: 422 });
    }

    // Mutate the request with the validated (and stripped/coerced) value
    req[target] = value;
    return next();
  };
};

module.exports = { validate };
