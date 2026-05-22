# 🏛️ Civic Issue Reporting API

A production-ready REST API for a civic issue reporting platform with JWT-based authentication, refresh token rotation, and role-based access control (RBAC).

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Roles & Permissions](#roles--permissions)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
  - [Auth Endpoints](#auth-endpoints)
  - [Issue Endpoints](#issue-endpoints)
- [curl Examples](#curl-examples)
- [Security Features](#security-features)
- [Running Tests](#running-tests)
- [Production Considerations](#production-considerations)

---

## Tech Stack

| Layer         | Technology                              |
|---------------|----------------------------------------|
| Runtime       | Node.js 18+                            |
| Framework     | Express 4                              |
| Authentication| JWT (jsonwebtoken) + bcryptjs          |
| Validation    | Joi                                    |
| Security      | Helmet, express-rate-limit, CORS       |
| Docs          | swagger-jsdoc + swagger-ui-express     |
| Logging       | Winston + Morgan                       |
| Testing       | Jest + Supertest                       |

---

## Project Structure

```
civic-issue-api/
├── src/
│   ├── app.js                    # Express app factory
│   ├── server.js                 # Entry point, graceful shutdown
│   ├── config/
│   │   ├── env.js                # Centralised env config
│   │   └── swagger.js            # OpenAPI 3.0 spec
│   ├── routes/
│   │   ├── auth.routes.js        # POST /auth/* with Swagger JSDoc
│   │   └── issue.routes.js       # /issues/* with Swagger JSDoc
│   ├── controllers/
│   │   ├── auth.controller.js    # Thin HTTP layer → service calls
│   │   └── issue.controller.js
│   ├── services/
│   │   ├── auth.service.js       # Business logic: register/login/refresh
│   │   └── issue.service.js      # Business logic: CRUD + RBAC logic
│   ├── middleware/
│   │   ├── auth.js               # authenticate() + authorize(...roles)
│   │   ├── validate.js           # Joi schema validation factory
│   │   ├── rateLimiter.js        # apiLimiter + authLimiter
│   │   ├── errorHandler.js       # Global error + 404 handlers
│   │   └── schemas/
│   │       ├── auth.schemas.js   # Joi schemas for auth routes
│   │       └── issue.schemas.js  # Joi schemas for issue routes
│   ├── models/
│   │   └── store.js              # In-memory store (swap with DB adapter)
│   └── utils/
│       ├── response.js           # sendSuccess() / sendError() envelopes
│       ├── jwt.js                # signAccessToken / verifyAccessToken
│       ├── geo.js                # Haversine distance helper
│       └── logger.js             # Winston logger
├── tests/
│   ├── auth.test.js              # 10 auth integration tests
│   └── issue.test.js             # 16 issue integration tests
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Roles & Permissions

| Action                        | Citizen | Official | Supervisor |
|-------------------------------|:-------:|:--------:|:----------:|
| Register / Login              | ✅      | ✅       | ✅         |
| Create issue                  | ✅      | ❌       | ❌         |
| List own issues               | ✅      | —        | —          |
| List ALL issues               | ❌      | ✅       | ✅         |
| View own issue detail         | ✅      | —        | —          |
| View any issue detail         | ❌      | ✅       | ✅         |
| Update issue status           | ❌      | ✅       | ✅         |
| Assign issue to official      | ❌      | ❌       | ✅         |
| View own issue history        | ✅      | —        | —          |
| View any issue history        | ❌      | ✅       | ✅         |

---

## Quick Start

### Backend

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env   # CORS_ORIGINS already includes http://localhost:5173

# 3. Start backend (port 3000)
npm run dev

# 4. Open Swagger UI
open http://localhost:3000/api/docs
```

### Frontend (React + Vite)

```bash
# In a second terminal
cd frontend
npm install
npm run dev        # opens http://localhost:5173
```

The Vite dev server proxies all `/api/*` requests to `http://localhost:3000`, so no CORS issues during development.

**Quick-login presets** on the login screen let you sign in as Citizen, Official, or Supervisor instantly (uses the sample accounts from the curl examples above — register them first if the store is empty).

```bash
# Register the preset accounts once
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Citizen","email":"jane@example.com","password":"Secure123!","role":"citizen"}' | jq .

curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob Official","email":"bob@city.gov","password":"Secure123!","role":"official"}' | jq .

curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Supervisor","email":"alice@city.gov","password":"Secure123!","role":"supervisor"}' | jq .
```

---

## Environment Variables

Copy `.env.example` to `.env` and set:

| Variable                    | Description                               | Default       |
|-----------------------------|-------------------------------------------|---------------|
| `NODE_ENV`                  | `development` / `production` / `test`     | `development` |
| `PORT`                      | HTTP port                                 | `3000`        |
| `JWT_ACCESS_SECRET`         | Secret for signing access tokens          | *(required)*  |
| `JWT_REFRESH_SECRET`        | Secret for signing refresh tokens         | *(required)*  |
| `JWT_ACCESS_EXPIRES_IN`     | Access token TTL (e.g. `15m`)             | `15m`         |
| `JWT_REFRESH_EXPIRES_IN`    | Refresh token TTL (e.g. `7d`)             | `7d`          |
| `RATE_LIMIT_WINDOW_MS`      | Rate limit window in ms                   | `900000`      |
| `RATE_LIMIT_MAX_REQUESTS`   | Max requests per window (general)         | `100`         |
| `AUTH_RATE_LIMIT_MAX`       | Max failed auth attempts per 15 min       | `10`          |
| `CORS_ORIGINS`              | Comma-separated allowed origins           | `localhost:3000` |
| `LOG_LEVEL`                 | Winston log level                         | `info`        |

---

## API Reference

### Response Envelope

Every response follows the same shape:

```json
{
  "success": true,
  "message": "Human-readable status message",
  "data": { ... },
  "errors": null
}
```

Errors:
```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "errors": [
    { "field": "email", "message": "email must be a valid email" }
  ]
}
```

---

### Auth Endpoints

| Method | Path              | Auth | Description                      |
|--------|-------------------|------|----------------------------------|
| POST   | `/api/auth/register` | —    | Register new account             |
| POST   | `/api/auth/login`    | —    | Login, receive token pair        |
| POST   | `/api/auth/refresh`  | —    | Rotate tokens                    |
| POST   | `/api/auth/logout`   | —    | Revoke refresh token             |

### Issue Endpoints

| Method | Path                        | Auth              | Description                   |
|--------|-----------------------------|-------------------|-------------------------------|
| POST   | `/api/issues`               | Citizen           | Report a new issue            |
| GET    | `/api/issues`               | All               | Filtered + paginated list     |
| GET    | `/api/issues/:id`           | All               | Issue detail + timeline       |
| PATCH  | `/api/issues/:id/status`    | Official/Supervisor | Update status               |
| POST   | `/api/issues/:id/assign`    | Supervisor        | Assign to official            |
| GET    | `/api/issues/:id/history`   | All               | Full audit trail              |

---

## curl Examples

> Replace `TOKEN` with the `accessToken` from the login response.

### 1. Register accounts

```bash
# Register a citizen
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Citizen",
    "email": "jane@example.com",
    "password": "Secure123!",
    "role": "citizen"
  }' | jq .

# Register an official
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob Official",
    "email": "bob@city.gov",
    "password": "Secure123!",
    "role": "official"
  }' | jq .

# Register a supervisor
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Supervisor",
    "email": "alice@city.gov",
    "password": "Secure123!",
    "role": "supervisor"
  }' | jq .
```

### 2. Login and capture tokens

```bash
CITIZEN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"Secure123!"}')

CITIZEN_TOKEN=$(echo $CITIZEN_RESPONSE | jq -r '.data.accessToken')
CITIZEN_REFRESH=$(echo $CITIZEN_RESPONSE | jq -r '.data.refreshToken')
echo "Citizen token: $CITIZEN_TOKEN"
```

### 3. Create an issue (citizen)

```bash
curl -s -X POST http://localhost:3000/api/issues \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CITIZEN_TOKEN" \
  -d '{
    "title": "Large pothole on Main Street",
    "description": "A deep pothole near 123 Main St is damaging vehicles and causing accidents.",
    "category": "roads",
    "priority": "high",
    "location": {
      "address": "123 Main St, Springfield",
      "lat": 40.7128,
      "lng": -74.0060
    },
    "attachments": ["https://cdn.example.com/pothole.jpg"]
  }' | jq .

# Save the issue ID
ISSUE_ID=$(curl -s -X POST http://localhost:3000/api/issues \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CITIZEN_TOKEN" \
  -d '{"title":"Broken streetlight near park","description":"Streetlight at Elm Park entrance has been dark for two weeks.","category":"electricity","priority":"medium","location":{"lat":40.7200,"lng":-74.0100}}' \
  | jq -r '.data.issue.id')
echo "Issue ID: $ISSUE_ID"
```

### 4. List issues with filters

```bash
# List all issues (official/supervisor)
OFFICIAL_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@city.gov","password":"Secure123!"}' | jq -r '.data.accessToken')

curl -s "http://localhost:3000/api/issues" \
  -H "Authorization: Bearer $OFFICIAL_TOKEN" | jq .

# Filter by category and status
curl -s "http://localhost:3000/api/issues?category=roads&status=open&page=1&limit=10" \
  -H "Authorization: Bearer $OFFICIAL_TOKEN" | jq .

# Geolocation filter: issues within 5 km of a point
curl -s "http://localhost:3000/api/issues?lat=40.7128&lng=-74.0060&radius=5" \
  -H "Authorization: Bearer $OFFICIAL_TOKEN" | jq .

# Date range filter
curl -s "http://localhost:3000/api/issues?dateFrom=2024-01-01&dateTo=2024-12-31" \
  -H "Authorization: Bearer $OFFICIAL_TOKEN" | jq .
```

### 5. Get issue detail with timeline

```bash
curl -s "http://localhost:3000/api/issues/$ISSUE_ID" \
  -H "Authorization: Bearer $CITIZEN_TOKEN" | jq .
```

### 6. Update issue status (official)

```bash
curl -s -X PATCH "http://localhost:3000/api/issues/$ISSUE_ID/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OFFICIAL_TOKEN" \
  -d '{
    "status": "in_progress",
    "note": "Repair crew scheduled for Thursday."
  }' | jq .
```

### 7. Assign issue to official (supervisor)

```bash
SUPERVISOR_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@city.gov","password":"Secure123!"}' | jq -r '.data.accessToken')

OFFICIAL_ID=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@city.gov","password":"Secure123!"}' | jq -r '.data.user.id')

curl -s -X POST "http://localhost:3000/api/issues/$ISSUE_ID/assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
  -d "{
    \"officialId\": \"$OFFICIAL_ID\",
    \"note\": \"Assigning to Bob for immediate attention.\"
  }" | jq .
```

### 8. View audit trail

```bash
curl -s "http://localhost:3000/api/issues/$ISSUE_ID/history" \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" | jq .
```

### 9. Refresh tokens

```bash
curl -s -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$CITIZEN_REFRESH\"}" | jq .
```

### 10. Logout

```bash
curl -s -X POST http://localhost:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$CITIZEN_REFRESH\"}" | jq .
```

---

## Security Features

| Feature                | Implementation                                               |
|------------------------|--------------------------------------------------------------|
| Security headers       | `helmet()` — XSS, HSTS, CSP, X-Frame-Options, etc.         |
| Rate limiting (general)| 100 req / 15 min per IP (configurable)                      |
| Rate limiting (auth)   | 10 failed attempts / 15 min — brute force protection        |
| Password hashing       | bcrypt with 12 rounds                                        |
| JWT access tokens      | Short-lived (15 min default), RS256 via HS256               |
| Refresh token rotation | Old token revoked on every refresh                           |
| RBAC                   | Per-route `authorize(...roles)` middleware                   |
| Input validation       | Joi — every route, body + params + query                    |
| Consistent errors      | No stack traces in production; uniform `{ success, ... }`   |
| CORS                   | Allowlist-based, credentials support                         |
| Body size limit        | 1 MB max                                                     |

---

## Running Tests

```bash
# Run all tests (26 assertions)
npm test

# Watch mode
npx jest --watch

# Coverage report
npx jest --coverage
```

Test coverage:
- **Auth**: register, duplicate email, validation, login, wrong password, token refresh, token reuse, logout
- **Issues**: create (citizen/official/unauth), RBAC visibility, filters, pagination, status update, idempotency conflict, assign, history audit trail

---

## Production Considerations

1. **Database**: Replace `src/models/store.js` with a Prisma/TypeORM adapter. All service code remains unchanged.
2. **Token storage**: Move refresh tokens to Redis with TTL expiry for horizontal scaling.
3. **Secrets**: Use a secrets manager (AWS Secrets Manager, Vault) — never commit `.env`.
4. **File uploads**: Add `multer` + S3/GCS integration for issue attachments.
5. **Email notifications**: Add a notification service triggered on issue status changes.
6. **Observability**: Add OpenTelemetry tracing; ship Winston logs to Datadog/CloudWatch.
7. **Container**: The app is 12-factor compliant — wrap in a Dockerfile and deploy to ECS/K8s.
8. **CI/CD**: Run `npm test` in your pipeline; block merges on failure.
