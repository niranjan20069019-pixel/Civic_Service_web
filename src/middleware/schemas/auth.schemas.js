const Joi = require('joi');
const { IssueStore } = require('../../models/store');

const passwordRules = Joi.string()
  .min(8)
  .max(128)
  .pattern(/[A-Z]/, 'uppercase')
  .pattern(/[a-z]/, 'lowercase')
  .pattern(/[0-9]/, 'digit')
  .required()
  .messages({
    'string.pattern.name': '{{#label}} must contain at least one {{#name}} letter',
    'string.min': 'Password must be at least 8 characters',
  });

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().required(),
  password: passwordRules,
  role: Joi.string()
    .valid('citizen', 'official', 'supervisor')
    .default('citizen'),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const logoutSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

module.exports = { registerSchema, loginSchema, refreshSchema, logoutSchema };
