const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const config = require('./config/env');
const swaggerSpec = require('./config/swagger');
const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const issueRoutes = require('./routes/issue.routes');
const adminRoutes = require('./routes/admin.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const createApp = () => {
  const app = express();

  // ─── Security headers ─────────────────────────────────────────────────────
  app.use(helmet());

  // ─── CORS ─────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow requests with no origin (curl, Postman, mobile apps)
        if (!origin) return cb(null, true);
        if (config.cors.origins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: Origin ${origin} not allowed`));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  // ─── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ─── Request logging ───────────────────────────────────────────────────────
  if (config.env !== 'test') {
    app.use(
      morgan('combined', {
        stream: { write: (msg) => logger.http(msg.trim()) },
      })
    );
  }

  // ─── Global rate limiter ───────────────────────────────────────────────────
  app.use('/api/', apiLimiter);

  // ─── Health check (no auth, no rate limit) ────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      message: 'Civic Issue API is running',
      data: {
        uptime: Math.floor(process.uptime()),
        env: config.env,
        timestamp: new Date().toISOString(),
      },
      errors: null,
    });
  });

  // ─── Swagger UI ───────────────────────────────────────────────────────────
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Civic Issue API Docs',
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerOptions: { persistAuthorization: true },
    })
  );

  // OpenAPI JSON spec endpoint
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  // ─── API Routes ───────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/issues', issueRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/analytics', analyticsRoutes);

  // ─── 404 handler ──────────────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ─── Global error handler (must be last) ──────────────────────────────────
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
