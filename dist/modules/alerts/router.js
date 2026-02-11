"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAlerts = evaluateAlerts;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../common/prisma");
const validation_1 = require("../../common/validation");
const audit_1 = require("../../common/audit");
const errors_1 = require("../../common/errors");
const config_1 = require("../../common/config");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
// ─── ALERT RULES CRUD ──────────────────────────────────────────────────────
const createAlertRuleSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    type: zod_1.z.enum(['NO_TELEMETRY', 'OVER_TEMP', 'POSSIBLE_LEAK', 'SENSOR_OUT_OF_RANGE']),
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    severity: zod_1.z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
    enabled: zod_1.z.boolean().optional(),
});
router.post('/rules', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(createAlertRuleSchema), async (req, res, next) => {
    try {
        const rule = await prisma_1.prisma.alertRule.create({
            data: { ...req.body, tenantId: req.tenantId },
        });
        res.status(201).json(rule);
    }
    catch (err) {
        next(err);
    }
});
router.get('/rules', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const rules = await prisma_1.prisma.alertRule.findMany({
            where: { tenantId: req.tenantId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(rules);
    }
    catch (err) {
        next(err);
    }
});
// ─── ALERT EVENTS ───────────────────────────────────────────────────────────
router.get('/', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const status = req.query.status;
        const severity = req.query.severity;
        const deviceId = req.query.deviceId;
        const limit = req.query.limit || '50';
        const offset = req.query.offset || '0';
        const where = { tenantId: req.tenantId };
        if (status)
            where.status = status;
        if (severity)
            where.severity = severity;
        if (deviceId)
            where.deviceId = deviceId;
        const [events, total] = await Promise.all([
            prisma_1.prisma.alertEvent.findMany({
                where,
                include: {
                    rule: { select: { name: true, type: true } },
                    device: { select: { serialNumber: true, name: true } },
                },
                orderBy: { openedAt: 'desc' },
                take: Math.min(parseInt(limit), 200),
                skip: parseInt(offset),
            }),
            prisma_1.prisma.alertEvent.count({ where }),
        ]);
        res.json({ events, total });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/ack', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const alert = await prisma_1.prisma.alertEvent.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!alert)
            throw new errors_1.NotFoundError('AlertEvent', req.params.id);
        const updated = await prisma_1.prisma.alertEvent.update({
            where: { id: alert.id },
            data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId: req.tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'ALERT_ACKNOWLEDGED',
            entityType: 'AlertEvent',
            entityId: alert.id,
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/close', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const alert = await prisma_1.prisma.alertEvent.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!alert)
            throw new errors_1.NotFoundError('AlertEvent', req.params.id);
        const updated = await prisma_1.prisma.alertEvent.update({
            where: { id: alert.id },
            data: { status: 'CLOSED', closedAt: new Date() },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId: req.tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'ALERT_CLOSED',
            entityType: 'AlertEvent',
            entityId: alert.id,
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
// ─── ALERT EVALUATION ENGINE ────────────────────────────────────────────────
async function evaluateAlerts() {
    let alertsCreated = 0;
    const rules = await prisma_1.prisma.alertRule.findMany({ where: { enabled: true } });
    for (const rule of rules) {
        const devices = await prisma_1.prisma.device.findMany({
            where: { tenantId: rule.tenantId, status: { in: ['ACTIVE', 'INSTALLED'] } },
        });
        for (const device of devices) {
            try {
                let shouldAlert = false;
                let details = {};
                const dedupeKey = `${device.id}:${rule.id}`;
                const existingOpen = await prisma_1.prisma.alertEvent.findFirst({
                    where: { dedupeKey, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
                });
                if (existingOpen)
                    continue;
                const params = rule.params;
                switch (rule.type) {
                    case 'NO_TELEMETRY': {
                        const thresholdMin = params.thresholdMinutes || config_1.config.noTelemetryThresholdMinutes;
                        const threshold = new Date(Date.now() - thresholdMin * 60 * 1000);
                        if (!device.lastSeenAt || device.lastSeenAt < threshold) {
                            shouldAlert = true;
                            details = { lastSeenAt: device.lastSeenAt, thresholdMinutes: thresholdMin };
                        }
                        break;
                    }
                    case 'OVER_TEMP': {
                        const twin = await prisma_1.prisma.deviceTwin.findUnique({ where: { deviceId: device.id } });
                        const state = twin?.derivedState;
                        const threshold = params.thresholdC || config_1.config.overTempThresholdC;
                        if (state?.lastTankTempC && state.lastTankTempC > threshold) {
                            shouldAlert = true;
                            details = { tankTempC: state.lastTankTempC, thresholdC: threshold };
                        }
                        break;
                    }
                    case 'POSSIBLE_LEAK': {
                        const lookbackMin = params.lookbackMinutes || 60;
                        const since = new Date(Date.now() - lookbackMin * 60 * 1000);
                        const recentTelemetry = await prisma_1.prisma.telemetry.findMany({
                            where: { deviceId: device.id, ts: { gte: since } },
                            orderBy: { ts: 'desc' },
                            take: 10,
                        });
                        const allFlowing = recentTelemetry.length >= 5 &&
                            recentTelemetry.every(t => {
                                const m = t.metrics;
                                return m.flowLpm !== undefined && m.flowLpm > 0.1;
                            });
                        if (allFlowing) {
                            shouldAlert = true;
                            details = { continuousFlowReadings: recentTelemetry.length, lookbackMinutes: lookbackMin };
                        }
                        break;
                    }
                    case 'SENSOR_OUT_OF_RANGE': {
                        const metricName = params.metric || 'tankTempC';
                        const min = params.min ?? -10;
                        const max = params.max ?? 120;
                        const repeatCount = params.repeatCount || config_1.config.sensorOutOfRangeRepeatCount;
                        const recent = await prisma_1.prisma.telemetry.findMany({
                            where: { deviceId: device.id },
                            orderBy: { ts: 'desc' },
                            take: repeatCount,
                        });
                        const outOfRange = recent.filter(t => {
                            const val = t.metrics?.[metricName];
                            return val !== undefined && (val < min || val > max);
                        });
                        if (outOfRange.length >= repeatCount) {
                            shouldAlert = true;
                            details = { metric: metricName, min, max, outOfRangeCount: outOfRange.length };
                        }
                        break;
                    }
                }
                if (shouldAlert) {
                    const alertEvent = await prisma_1.prisma.alertEvent.create({
                        data: {
                            tenantId: rule.tenantId,
                            deviceId: device.id,
                            ruleId: rule.id,
                            severity: rule.severity,
                            status: 'OPEN',
                            details,
                            dedupeKey,
                        },
                    });
                    await dispatchAlertNotifications(rule.tenantId, alertEvent.id, rule.severity);
                    alertsCreated++;
                }
            }
            catch (err) {
                console.error(`Alert evaluation error for device ${device.id}, rule ${rule.id}:`, err);
            }
        }
    }
    return alertsCreated;
}
async function dispatchAlertNotifications(tenantId, alertEventId, severity) {
    const channels = await prisma_1.prisma.notificationChannel.findMany({
        where: { tenantId, enabled: true },
    });
    for (const channel of channels) {
        if (channel.type === 'WEBHOOK' || severity !== 'INFO') {
            await prisma_1.prisma.notificationEvent.create({
                data: {
                    tenantId,
                    channelId: channel.id,
                    alertEventId,
                    status: 'QUEUED',
                    payload: { alertEventId, severity, channelType: channel.type },
                },
            });
        }
    }
}
//# sourceMappingURL=router.js.map