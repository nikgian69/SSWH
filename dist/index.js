"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./common/config");
const middleware_1 = require("./common/middleware");
const jobs_1 = require("./common/jobs");
// Module routers
const router_1 = __importDefault(require("./modules/auth/router"));
const router_2 = __importDefault(require("./modules/tenants/router"));
const router_3 = __importDefault(require("./modules/users/router"));
const router_4 = __importDefault(require("./modules/sites/router"));
const router_5 = __importDefault(require("./modules/devices/router"));
const router_6 = __importDefault(require("./modules/telemetry/router"));
const router_7 = __importDefault(require("./modules/twins/router"));
const router_8 = __importDefault(require("./modules/commands/router"));
const router_9 = __importDefault(require("./modules/ota/router"));
const router_10 = __importDefault(require("./modules/sim/router"));
const router_11 = __importDefault(require("./modules/alerts/router"));
const router_12 = __importDefault(require("./modules/analytics/router"));
const router_13 = __importDefault(require("./modules/notifications/router"));
const router_14 = __importDefault(require("./modules/entitlements/router"));
const router_15 = __importDefault(require("./modules/audit/router"));
const router_16 = __importDefault(require("./modules/integrations/router"));
const map_router_1 = __importDefault(require("./modules/sites/map.router"));
const app = (0, express_1.default)();
exports.app = app;
// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use((0, helmet_1.default)({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('combined'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// ─── OPENAPI / SWAGGER ─────────────────────────────────────────────────────
const swaggerSpec = (0, swagger_jsdoc_1.default)({
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'SSWH Backend Platform API',
            version: '1.0.0',
            description: 'Smart Solar Water Heater — Multi-tenant SaaS Backend API',
            contact: { name: 'SSWH Team' },
        },
        servers: [
            { url: `http://localhost:${config_1.config.port}`, description: 'Local development' },
            { url: process.env.RENDER_EXTERNAL_URL || `http://localhost:${config_1.config.port}`, description: 'Production' },
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
app.use('/api/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'SSWH API Documentation',
}));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));
// ─── ROUTES ─────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});
app.use('/api/auth', router_1.default);
app.use('/api/tenants', router_2.default);
app.use('/api/users', router_3.default);
app.use('/api/sites', router_4.default);
app.use('/api/devices', router_5.default);
app.use('/api/ingest/telemetry', router_6.default);
app.use('/api/devices', router_7.default); // /api/devices/:id/twin
app.use('/api/devices', router_8.default); // /api/devices/:id/commands
app.use('/api/ota', router_9.default); // /api/ota/firmware, /api/ota/jobs, /api/devices/:id/ota/*
app.use('/api/sim', router_10.default);
app.use('/api/integrations/sim', router_10.default); // Also mount at /api/integrations/sim/sync per spec
app.use('/api/alerts', router_11.default);
app.use('/api', router_12.default); // /api/devices/:id/timeseries, /api/tenants/:id/dashboard/summary
app.use('/api/notifications', router_13.default);
app.use('/api/entitlements', router_14.default);
app.use('/api/audit', router_15.default);
app.use('/api/integrations', router_16.default);
app.use('/api/map', map_router_1.default);
// ─── STATIC FILES (Web Dashboard) ───────────────────────────────────────────
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
app.get('/', (_req, res) => res.sendFile(path_1.default.join(__dirname, '..', 'public', 'index.html')));
// ─── ERROR HANDLER ──────────────────────────────────────────────────────────
app.use(middleware_1.errorHandler);
// ─── START SERVER ───────────────────────────────────────────────────────────
const server = app.listen(config_1.config.port, () => {
    console.log(`\n🌞 SSWH Backend Platform running on port ${config_1.config.port}`);
    console.log(`📚 API Docs: http://localhost:${config_1.config.port}/api/docs`);
    console.log(`🔧 Environment: ${config_1.config.nodeEnv}\n`);
    if (config_1.config.nodeEnv !== 'test') {
        (0, jobs_1.startBackgroundJobs)();
    }
});
exports.server = server;
//# sourceMappingURL=index.js.map