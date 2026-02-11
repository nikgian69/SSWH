import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { config } from './common/config';
import { errorHandler } from './common/middleware';
import { startBackgroundJobs } from './common/jobs';

// Module routers
import authRouter from './modules/auth/router';
import tenantsRouter from './modules/tenants/router';
import usersRouter from './modules/users/router';
import sitesRouter from './modules/sites/router';
import devicesRouter from './modules/devices/router';
import telemetryRouter from './modules/telemetry/router';
import twinsRouter from './modules/twins/router';
import commandsRouter from './modules/commands/router';
import otaRouter from './modules/ota/router';
import simRouter from './modules/sim/router';
import alertsRouter from './modules/alerts/router';
import analyticsRouter from './modules/analytics/router';
import notificationsRouter from './modules/notifications/router';
import entitlementsRouter from './modules/entitlements/router';
import auditRouter from './modules/audit/router';
import integrationsRouter from './modules/integrations/router';
import mapRouter from './modules/sites/map.router';

const app = express();

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── OPENAPI / SWAGGER ─────────────────────────────────────────────────────

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'SSWH Backend Platform API',
      version: '1.0.0',
      description: 'Smart Solar Water Heater — Multi-tenant SaaS Backend API',
      contact: { name: 'SSWH Team' },
    },
    servers: [
      { url: `http://localhost:${config.port}`, description: 'Local development' },
      { url: process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.port}`, description: 'Production' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for user authentication',
        },
        DeviceAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Device token in format deviceId:hmac',
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Tenants', description: 'Tenant management' },
      { name: 'Users', description: 'User and membership management' },
      { name: 'Sites', description: 'Site management' },
      { name: 'Devices', description: 'Device management and onboarding' },
      { name: 'Telemetry', description: 'Telemetry ingestion' },
      { name: 'DigitalTwins', description: 'Device digital twins' },
      { name: 'Commands', description: 'Command and control' },
      { name: 'OTA', description: 'Over-the-air firmware updates' },
      { name: 'SIM', description: 'SIM card management' },
      { name: 'Alerts', description: 'Alert rules and events' },
      { name: 'Analytics', description: 'Analytics, rollups, and dashboards' },
      { name: 'Notifications', description: 'Notification channels and events' },
      { name: 'Entitlements', description: 'Feature flags and entitlements' },
      { name: 'Audit', description: 'Audit logs' },
      { name: 'Map', description: 'Map and geolocation' },
      { name: 'Integrations', description: 'External integrations (weather, webhooks)' },
    ],
  },
  apis: ['./src/modules/*/router.ts', './src/modules/*/*.router.ts'],
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SSWH API Documentation',
}));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// ─── ROUTES ─────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

app.use('/api/auth', authRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/users', usersRouter);
app.use('/api/sites', sitesRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/ingest/telemetry', telemetryRouter);
app.use('/api/devices', twinsRouter);        // /api/devices/:id/twin
app.use('/api/devices', commandsRouter);     // /api/devices/:id/commands
app.use('/api/ota', otaRouter);              // /api/ota/firmware, /api/ota/jobs, /api/devices/:id/ota/*
app.use('/api/sim', simRouter);
app.use('/api/integrations/sim', simRouter);  // Also mount at /api/integrations/sim/sync per spec
app.use('/api/alerts', alertsRouter);
app.use('/api', analyticsRouter);            // /api/devices/:id/timeseries, /api/tenants/:id/dashboard/summary
app.use('/api/notifications', notificationsRouter);
app.use('/api/entitlements', entitlementsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/map', mapRouter);

// ─── STATIC FILES (Web Dashboard) ───────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ─── ERROR HANDLER ──────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── START SERVER ───────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  console.log(`\n🌞 SSWH Backend Platform running on port ${config.port}`);
  console.log(`📚 API Docs: http://localhost:${config.port}/api/docs`);
  console.log(`🔧 Environment: ${config.nodeEnv}\n`);

  if (config.nodeEnv !== 'test') {
    startBackgroundJobs();
  }
});

export { app, server };
