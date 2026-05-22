const Joi = require('joi');

const CATEGORIES = ['roads', 'sanitation', 'water', 'electricity', 'parks', 'safety', 'other'];

const updateSLAConfigSchema = Joi.object({
  category:  Joi.string().valid(...CATEGORIES).required(),
  sla_hours: Joi.number().positive().max(8760).required(), // max 1 year
});

module.exports = { updateSLAConfigSchema };
