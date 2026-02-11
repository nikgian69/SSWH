# SSWH Backend Platform

**Smart Solar Water Heater — Multi-Tenant SaaS Backend**

A production-ready, modular monolith backend for managing fleets of smart solar water heaters. Supports device onboarding, telemetry ingestion, digital twins, analytics, alerts, commands, OTA firmware updates, SIM management, and map-based geolocation (OpenStreetMap-compatible).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Express.js REST API                         │
│  ┌──────┐ ┌────────┐ ┌───────┐ ┌────────┐ ┌────────────────┐  │
│  │ Auth │ │Tenants │ │ Users │ │ Sites  │ │    Devices     │  │
│  └──────┘ └────────┘ └───────┘ └────────┘ └────────────────┘  │
│  ┌──────────┐ ┌──────┐ ┌──────────┐ ┌─────┐ ┌─────────────┐  │
│  │Telemetry │ │Twins │ │Commands  │ │ OTA │ │     SIM     │  │
│  └──────────┘ └──────┘ └──────────┘ └─────┘ └─────────────┘  │
│  ┌────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────────┐  │
│  │Alerts  │ │Notifications │ │Entitlements │ │ Analytics  │  │
│  └────────┘ └──────────────┘ └─────────────┘ └────────────┘  │
│  ┌──────────────┐ ┌───────┐ ┌─────┐                          │
│  │Integrations  │ │ Audit │ │ Map │                           │
│  └──────────────┘ └───────┘ └─────┘                           │
├─────────────────────────────────────────────────────────────────┤
│  Common: Auth Middleware │ Tenancy Enforcement │ Validation     │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL + Prisma ORM  │  Background Jobs (node-cron)       │
└─────────────────────────────────────────────────────────────────┘
```

| Component | Technology |
|---|---|
| Language | TypeScript (Node.js) |
| Framework | Express 4 |
| Database | PostgreSQL 14 |
| ORM | Prisma 5 + migrations |
| Auth | JWT (users) + HMAC-SHA256 (devices) |
| Validation | Zod v4 |
| API Docs | OpenAPI 3.0 / Swagger UI |
| Tests | Vitest + Supertest |
| Jobs | node-cron (Postgres-based scheduler) |

---

## Module Structure

```
src/
├── common/
│   ├── config.ts          # Environment configuration
│   ├── prisma.ts          # Prisma client singleton
│   ├── errors.ts          # Error classes (AppError, NotFoundError, etc.)
│   ├── validation.ts      # Zod validation middleware
│   ├── audit.ts           # Audit logging helper
│   ├── jobs.ts            # Background job scheduler (cron)
│   └── middleware/
│       ├── auth.ts        # JWT + device HMAC auth
│       ├── tenancy.ts     # Tenant enforcement
│       ├── errorHandler.ts
│       └── index.ts
├── modules/
│   ├── auth/              # Login, register, JWT issuance
│   ├── tenants/           # Tenant CRUD
│   ├── users/             # User invitations, memberships, role management
│   ├── sites/             # Site CRUD + PATCH location + map/geolocation
│   ├── devices/           # Device onboarding, lifecycle, bulk register
│   ├── telemetry/         # Telemetry ingestion + validation + geo logic
│   ├── twins/             # Digital twin read
│   ├── commands/          # Command & control (remote boost, polling, ACK)
│   ├── ota/               # Firmware CRUD + OTA job scheduling + progress
│   ├── sim/               # SIM management + provider adapter interface
│   ├── alerts/            # Alert rules, events, evaluation engine, dedup
│   ├── analytics/         # Timeseries, daily rollups, dashboard summary
│   ├── notifications/     # Email/SMS/Webhook channels + dispatch
│   ├── entitlements/      # Feature flags (BASIC_REMOTE_BOOST, SMART_HOME)
│   ├── integrations/      # Weather fetch, webhooks
│   └── audit/             # Audit log query
├── types/
│   └── express.d.ts       # Express type augmentations
└── index.ts               # Express app + route mounting + Swagger
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `DATABASE_URL` | `postgresql://sswh:sswh_pass@localhost:5432/sswh_db` | PostgreSQL connection string |
| `JWT_SECRET` | `sswh-jwt-secret-change-in-production` | JWT signing secret |
| `JWT_EXPIRES_IN` | `24h` | JWT token expiry |
| `DEVICE_HMAC_SECRET` | `sswh-device-hmac-secret-change-in-production` | HMAC secret for device auth |
| `NODE_ENV` | `development` | Environment mode |
| `ALERT_EVAL_INTERVAL_MINUTES` | `5` | Alert evaluation frequency |
| `NO_TELEMETRY_THRESHOLD_MINUTES` | `30` | No-telemetry alert threshold |
| `OVER_TEMP_THRESHOLD_C` | `85` | Over-temperature alert threshold |

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Setup

```bash
# Install dependencies
cd sswh-backend
npm install

# Configure environment
cp .env .env.local   # Edit DATABASE_URL if needed

# Create database
createdb sswh_db

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Seed demo data
npx tsx prisma/seed.ts

# Build and start
npm run build
npm start
```

### Development

```bash
npm run dev          # Start with tsx (auto-reload)
npm run build        # Compile TypeScript
npm test             # Run all 32 acceptance tests
npm run db:seed      # Re-seed database
```

---

## Multi-Tenancy & RBAC

### Roles

| Role | Scope | Capabilities |
|---|---|---|
| `PLATFORM_ADMIN` | Global | All operations, cross-tenant access |
| `TENANT_ADMIN` | Tenant | Full tenant management, users, devices, alerts, OTA |
| `INSTALLER` | Tenant | Device onboarding, site management, location updates |
| `SUPPORT_AGENT` | Tenant | Read-only fleet view, diagnostics, SIM status |
| `END_USER` | Tenant | Own devices, basic actions, update own site location |

### Tenancy Enforcement

Every API request (except `/api/auth/*` and `/api/health`) requires:

1. **JWT Bearer token** — identifies the user
2. **`x-tenant-id` header** — selects the tenant context

The `enforceTenancy` middleware verifies the user has a membership in the requested tenant. Cross-tenant access is rejected with `403 Forbidden`. `PLATFORM_ADMIN` users can access any tenant.

---

## API Documentation

- **Swagger UI**: `http://localhost:3000/api/docs`
- **OpenAPI JSON**: `http://localhost:3000/api/docs.json`

---

## API Examples (curl)

### Authentication

```bash
# Register new user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret123","name":"Test User"}'

# Login (returns JWT)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sswh.io","password":"password123"}'
# Response: { "token": "eyJ...", "user": { ... } }

export TOKEN="<jwt-from-login>"
export TID="<tenant-id>"
```

### Tenant Management

```bash
# List tenants (platform admin)
curl -s http://localhost:3000/api/tenants \
  -H "Authorization: Bearer $TOKEN"

# Create tenant
curl -X POST http://localhost:3000/api/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"New Tenant","type":"RETAILER"}'
```

### User Invitations & Roles

```bash
# Invite user to tenant
curl -X POST http://localhost:3000/api/users/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"email":"new@example.com","name":"New User","role":"INSTALLER"}'

# Change user role
curl -X PATCH http://localhost:3000/api/users/<userId>/role \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"role":"TENANT_ADMIN"}'
```

### Site Management

```bash
# Create site
curl -X POST http://localhost:3000/api/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Athens Office",
    "addressLine1": "42 Ermou Street",
    "city": "Athens", "country": "GR",
    "lat": 37.9755, "lon": 23.7348,
    "locationSource": "MANUAL"
  }'

# Update site location (with lock)
curl -X PATCH http://localhost:3000/api/sites/<siteId>/location \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"lat":37.975,"lon":23.735,"source":"MOBILE_GPS","accuracyM":5,"lock":true}'
```

### Device Onboarding

```bash
# Register single device
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"serialNumber":"SSWH-2024-100","model":"SSWH-200L","siteId":"<siteId>"}'
# Response includes deviceToken for telemetry ingestion

# Bulk register devices
curl -X POST http://localhost:3000/api/devices/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"devices":[
    {"serialNumber":"BULK-001","model":"SSWH-200L"},
    {"serialNumber":"BULK-002","model":"SSWH-300L"}
  ]}'

# List devices (with filters)
curl -s "http://localhost:3000/api/devices?status=ACTIVE&model=SSWH-200L" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"

# Device detail with twin
curl -s http://localhost:3000/api/devices/<deviceId> \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"

# Assign device to site
curl -X PATCH http://localhost:3000/api/devices/<deviceId>/assign \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"siteId":"<siteId>","ownerUserId":"<userId>"}'

# Update device lifecycle status
curl -X PATCH http://localhost:3000/api/devices/<deviceId>/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"status":"INSTALLED"}'
```

### Telemetry Ingestion (Device Auth)

```bash
export DEVICE_TOKEN="<deviceId>:<hmac>"

curl -X POST http://localhost:3000/api/ingest/telemetry \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "<deviceId>",
    "ts": "2026-02-10T10:15:00Z",
    "metrics": {
      "tankTempC": 58.2, "ambientTempC": 12.1, "humidityPct": 68,
      "lux": 12500, "flowLpm": 3.2, "heaterOn": true,
      "powerW": 1800, "batteryPct": 92, "rssiDbm": -88
    },
    "geo": {"lat": 37.9755, "lon": 23.7348, "accuracyM": 15, "source": "EDGE_GNSS"}
  }'
```

### Map / Geolocation

```bash
# Get device markers in bounding box
curl -s "http://localhost:3000/api/map/devices?bbox=20,35,30,42" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"

# Get clustered markers (for low zoom)
curl -s "http://localhost:3000/api/map/devices/clusters?bbox=20,35,30,42&zoom=5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"
```

### Commands (Remote Boost)

```bash
# Create remote boost command
curl -X POST http://localhost:3000/api/devices/<deviceId>/commands \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"type":"REMOTE_BOOST_SET","payload":{"enabled":true}}'

# Device polls pending commands (device auth)
curl -s http://localhost:3000/api/devices/<deviceId>/commands/pending \
  -H "Authorization: Bearer $DEVICE_TOKEN"

# Device ACKs command (device auth)
curl -X POST http://localhost:3000/api/devices/<deviceId>/commands/<cmdId>/ack \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACKED"}'
```

### Alerts

```bash
# Create alert rule
curl -X POST http://localhost:3000/api/alerts/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"name":"High Temp","type":"OVER_TEMP","params":{"thresholdC":85},"severity":"CRITICAL"}'

# List open alerts
curl -s "http://localhost:3000/api/alerts?status=OPEN" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"

# Acknowledge alert
curl -X POST http://localhost:3000/api/alerts/<alertId>/ack \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"

# Close alert
curl -X POST http://localhost:3000/api/alerts/<alertId>/close \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"
```

### OTA Updates

```bash
# Register firmware
curl -X POST http://localhost:3000/api/ota/firmware \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version":"1.3.0","fileUrl":"https://fw.example.com/v1.3.0.bin","checksum":"sha256:abc","releaseNotes":"Bug fixes"}'

# Schedule OTA job for a device
curl -X POST http://localhost:3000/api/ota/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"targetType":"DEVICE","deviceId":"<id>","firmwarePackageId":"<fwId>","scheduledAt":"2026-02-11T02:00:00Z"}'

# List OTA jobs
curl -s http://localhost:3000/api/ota/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"
```

### SIM Management

```bash
# Register SIM
curl -X POST http://localhost:3000/api/sim \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"iccid":"893000000001","carrier":"Cosmote","planName":"IoT Basic"}'

# Request SIM action
curl -X POST http://localhost:3000/api/sim/893000000001/actions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"ACTIVATE"}'

# Sync SIM status from provider
curl -X POST http://localhost:3000/api/integrations/sim/sync \
  -H "Authorization: Bearer $TOKEN"
```

### Analytics & Dashboard

```bash
# Device timeseries (raw telemetry)
curl -s "http://localhost:3000/api/devices/<id>/timeseries?from=2026-02-09&to=2026-02-10&metric=tankTempC" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"

# Daily rollups
curl -s "http://localhost:3000/api/devices/<id>/rollups/daily?from=2026-02-01&to=2026-02-10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"

# Tenant dashboard summary (KPIs)
curl -s "http://localhost:3000/api/tenants/$TID/dashboard/summary" \
  -H "Authorization: Bearer $TOKEN"
```

### Entitlements

```bash
# Set entitlement
curl -X POST http://localhost:3000/api/entitlements \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID" \
  -H "Content-Type: application/json" \
  -d '{"scope":"TENANT","key":"SMART_HOME_INTEGRATION","enabled":true}'

# Check entitlement
curl -s "http://localhost:3000/api/entitlements/check?key=BASIC_REMOTE_BOOST" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"
```

### Audit Logs

```bash
curl -s "http://localhost:3000/api/audit?entityType=Device&limit=20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TID"
```

---

## Background Jobs

| Job | Schedule | Description |
|---|---|---|
| Alert Evaluation | Every 5 min | Evaluates NO_TELEMETRY, OVER_TEMP, POSSIBLE_LEAK, SENSOR_OUT_OF_RANGE rules |
| Daily Rollups | 2:00 AM | Computes energy, water, temperature aggregates per device |
| Notification Processing | Every 1 min | Dispatches queued notifications (email/SMS/webhook) |
| Weather Fetch | 6:00 AM | Fetches weather forecasts for all sites with coordinates |

---

## Seed Data

The seed script (`npx tsx prisma/seed.ts`) creates:

| Entity | Details |
|---|---|
| Users | `admin@sswh.io` (Platform Admin), `tenant.admin@sswh.io`, `installer@sswh.io`, `user@sswh.io`, `tenantb.admin@sswh.io` |
| Password | `password123` for all users |
| Tenants | SolarHeat Co. (Manufacturer), GreenEnergy Retail (Retailer) |
| Sites | Athens, Thessaloniki (Tenant A), Patras (Tenant B) |
| Devices | 4 devices across ACTIVE, INSTALLED, PROVISIONED statuses |
| SIMs | 3 SIM cards linked to devices |
| Telemetry | 24 hourly readings for Device 1 |
| Alerts | 3 alert rules + 1 open alert event |
| OTA | 1 firmware package + 1 scheduled OTA job |
| Notifications | Webhook + Email channels with queued event |
| Entitlements | BASIC_REMOTE_BOOST enabled for Tenant A |

---

## Testing

```bash
# Run all 32 acceptance tests
npm test

# Verbose output
npx vitest run --reporter=verbose
```

### Test Categories

| Category | Tests | Description |
|---|---|---|
| A) Tenant + User lifecycle | 5 | Registration, tenant creation, invitations, role assignment, login |
| B) Device Onboarding | 4 | Site creation, device registration, assignment, lifecycle status |
| C) Telemetry Ingestion | 1 | Ingest → lastSeenAt update → DeviceTwin update |
| D) Map & Location Lock | 3 | Location update, bbox query, locationLock enforcement |
| E) Command Lifecycle | 3 | Create → poll → ACK state machine |
| F) Alert Lifecycle | 5 | Rule creation, event lifecycle, dedup (unique constraint) |
| G) OTA & SIM | 3 | Firmware registration, OTA scheduling, SIM actions |
| H) Tenant Isolation | 5 | Cross-tenant access denied for devices, sites, alerts, map |

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Device not found: <id>"
  }
}
```

| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid request body/params |
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `FORBIDDEN` | 403 | Insufficient permissions or cross-tenant access |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Data Model (17+ models)

### Core Models

- **Tenant** — Organization with type (MANUFACTURER, RETAILER, INSTALLER, PROPERTY_MANAGER)
- **User** — User account with email/password
- **Membership** — User-Tenant-Role binding (supports multi-tenant membership)

### Sites & Locations (Light GIS)

- **Site** — Physical location with address, coordinates, locationSource, locationLock, locationConfidence
- **WeatherData** — Daily weather summary per site

### Devices

- **Device** — IoT device with lifecycle status, coordinates, firmware version, SIM link, owner
- **DeviceSecret** — HMAC secret or public key for device authentication
- **DeviceTwin** — Digital twin with derived state (isOnline, healthScore, last sensor values)

### Telemetry

- **Telemetry** — Time-series data with canonical metrics JSONB + optional geo

### Commands & OTA

- **Command** — Remote action with state machine (QUEUED → DELIVERED → ACKED/FAILED)
- **FirmwarePackage** — Firmware metadata (version, URL, checksum)
- **OtaJob** — OTA deployment job targeting device or group

### SIM

- **SimInfo** — SIM card metadata (ICCID, carrier, plan, status, usage)
- **SimAction** — SIM lifecycle action with provider adapter

### Alerts & Notifications

- **AlertRule** — Rule definition (NO_TELEMETRY, OVER_TEMP, POSSIBLE_LEAK, SENSOR_OUT_OF_RANGE)
- **AlertEvent** — Alert instance with dedup key, lifecycle (OPEN → ACKNOWLEDGED → CLOSED)
- **NotificationChannel** — Email/SMS/Webhook channel configuration
- **NotificationEvent** — Notification dispatch record

### Analytics & Entitlements

- **DailyRollup** — Daily aggregates (energy, water, temperature, heater runtime)
- **Entitlement** — Feature flag (BASIC_REMOTE_BOOST, SMART_HOME_INTEGRATION)
- **AuditLog** — Immutable audit trail for all significant actions

---

## Deployment Runbook

### Production Checklist

1. Set strong secrets: `JWT_SECRET`, `DEVICE_HMAC_SECRET`
2. Configure managed PostgreSQL with SSL
3. Run migrations: `npx prisma migrate deploy`
4. Set `NODE_ENV=production`
5. Replace stub notification providers (email/SMS/webhook)
6. Replace stub weather provider with real API (OpenWeatherMap, etc.)
7. Replace stub SIM provider with carrier API adapter
8. Set up health monitoring at `/api/health`
9. Enable HTTPS via reverse proxy (nginx/Caddy)
10. Configure log aggregation (Morgan combined format)

### Scaling Notes

- Modular monolith design allows splitting into microservices later
- Telemetry table should be partitioned by time for large deployments
- Consider TimescaleDB for time-series performance at scale
- Background jobs can migrate to BullMQ + Redis for horizontal scaling
- Map clustering can be enhanced with PostGIS for production GIS needs
- Device auth can be upgraded to mutual TLS for production security

---

## License

Proprietary — SSWH Team
