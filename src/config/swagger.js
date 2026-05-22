const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./env');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Civic Issue Reporting API',
      version: '1.0.0',
      description: `
## Civic Issue Reporting Platform

A production-ready REST API for managing civic issues with role-based access control.

### Roles
- **Citizen** — Can create issues and view their own issues
- **Official** — Can view all issues and update issue statuses
- **Supervisor** — Full access: assign issues to officials, manage statuses, view audit trails

### Authentication
All protected endpoints require a Bearer JWT in the \`Authorization\` header:
\`Authorization: Bearer <access_token>\`
      `,
      contact: {
        name: 'Civic Platform Team',
        email: 'api@civic-platform.dev',
      },
      license: { name: 'MIT' },
    },
    servers: [
      { url: `http://localhost:${config.port}`, description: 'Development server' },
      { url: 'https://api.civic-platform.dev', description: 'Production server' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your access token',
        },
      },
      schemas: {
        ErrorEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation error' },
            data: { type: 'object', nullable: true, example: null },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        SuccessEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' },
            data: { type: 'object' },
            errors: { type: 'array', nullable: true, example: null },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['citizen', 'official', 'supervisor'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Issue: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            category: {
              type: 'string',
              enum: ['roads', 'sanitation', 'water', 'electricity', 'parks', 'safety', 'other'],
            },
            status: {
              type: 'string',
              enum: ['open', 'in_progress', 'resolved', 'closed', 'rejected'],
            },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            location: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                lat: { type: 'number' },
                lng: { type: 'number' },
              },
            },
            attachments: { type: 'array', items: { type: 'string' } },
            reportedBy: { type: 'string', format: 'uuid' },
            assignedTo: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        HistoryEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            issueId: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
            field: { type: 'string', nullable: true },
            oldValue: { nullable: true },
            newValue: { nullable: true },
            performedBy: { type: 'string', format: 'uuid' },
            performedByName: { type: 'string' },
            performedByRole: { type: 'string' },
            note: { type: 'string', nullable: true },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        SLAConfig: {
          type: 'object',
          properties: {
            category:   { type: 'string' },
            sla_hours:  { type: 'number' },
            updated_by: { type: 'string', format: 'uuid', nullable: true },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        SLAStatus: {
          type: 'object',
          properties: {
            issue_id:        { type: 'string', format: 'uuid' },
            category:        { type: 'string' },
            issue_status:    { type: 'string' },
            sla_hours:       { type: 'number', description: 'Configured SLA target in hours' },
            elapsed_hours:   { type: 'number', description: 'Hours elapsed since issue creation' },
            remaining_hours: { type: 'number', description: 'Hours remaining until SLA breach' },
            breach_at:       { type: 'string', format: 'date-time', description: 'Absolute breach timestamp' },
            pct_elapsed:     { type: 'number', description: 'Percentage of SLA window elapsed (0–100)' },
            status: {
              type: 'string',
              enum: ['on_track', 'warning', 'breached', 'met'],
              description: 'on_track: <80% elapsed; warning: >80% elapsed; breached: past SLA; met: resolved within SLA',
            },
          },
        },
        AnalyticsSummary: {
          type: 'object',
          properties: {
            total_issues:               { type: 'integer' },
            resolved_count:             { type: 'integer' },
            resolved_pct:               { type: 'number' },
            avg_resolution_hours_overall: { type: 'number', nullable: true },
            per_category: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category:             { type: 'string' },
                  total:                { type: 'integer' },
                  resolved_count:       { type: 'integer' },
                  avg_resolution_hours: { type: 'number', nullable: true },
                },
              },
            },
          },
        },
        CategoryBreakdown: {
          type: 'object',
          properties: {
            category:                 { type: 'string' },
            total:                    { type: 'integer' },
            resolved_count:           { type: 'integer' },
            resolved_pct:             { type: 'number' },
            avg_resolution_hours:     { type: 'number', nullable: true },
            avg_first_response_hours: { type: 'number', nullable: true },
          },
        },
        ResponseTimeSeries: {
          type: 'object',
          properties: {
            period:                   { type: 'string', format: 'date', description: 'YYYY-MM-DD (start of window)' },
            granularity:              { type: 'string', enum: ['daily', 'weekly'] },
            issues_created:           { type: 'integer' },
            avg_first_response_hours: { type: 'number', nullable: true },
            avg_resolution_hours:     { type: 'number', nullable: true },
          },
        },
        GeoJSONFeatureCollection: {
          type: 'object',
          properties: {
            type:     { type: 'string', enum: ['FeatureCollection'] },
            features: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type:     { type: 'string', enum: ['Feature'] },
                  geometry: {
                    type: 'object',
                    properties: {
                      type:        { type: 'string', enum: ['Point'] },
                      coordinates: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                    },
                  },
                  properties: {
                    type: 'object',
                    properties: {
                      cluster_id:  { type: 'integer' },
                      issue_count: { type: 'integer' },
                      categories:  { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication & session management' },
      { name: 'Issues', description: 'Civic issue CRUD and workflow operations' },
      { name: 'Admin', description: 'Supervisor-only SLA configuration management' },
      { name: 'Analytics', description: 'Public transparency dashboard data (no auth required)' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
