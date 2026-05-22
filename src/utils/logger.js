const winston = require('winston');
const config = require('../config/env');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack ? `${timestamp} ${level}: ${message}\n${stack}` : `${timestamp} ${level}: ${message}`
  )
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: config.log.level,
  format: config.env === 'production' ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  silent: config.env === 'test',
});

module.exports = logger;
