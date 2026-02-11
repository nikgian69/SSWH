"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDailyRollups = computeDailyRollups;
const express_1 = require("express");
const prisma_1 = require("../../common/prisma");
const errors_1 = require("../../common/errors");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
/**
 * @openapi
 * /api/devices/{id}/timeseries:
 *   get:
 *     tags: [Analytics]
 *     summary: Get raw telemetry timeseries for a device
 */
router.get('/devices/:id/timeseries', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const from = req.query.from;
        const to = req.query.to;
        const metric = req.query.metric;
        const limit = req.query.limit || '500';
        const device = await prisma_1.prisma.device.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!device)
            throw new errors_1.NotFoundError('Device', req.params.id);
        const where = { deviceId: device.id };
        if (from)
            where.ts = { ...where.ts, gte: new Date(from) };
        if (to)
            where.ts = { ...where.ts, lte: new Date(to) };
        const telemetry = await prisma_1.prisma.telemetry.findMany({
            where,
            orderBy: { ts: 'asc' },
            take: Math.min(parseInt(limit), 2000),
            select: { ts: true, metrics: true },
        });
        if (metric) {
            const series = telemetry.map(t => ({
                ts: t.ts,
                value: t.metrics?.[metric] ?? null,
            }));
            return res.json({ metric, series });
        }
        res.json({ series: telemetry });
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/devices/{id}/rollups/daily:
 *   get:
 *     tags: [Analytics]
 *     summary: Get daily rollups for a device
 */
router.get('/devices/:id/rollups/daily', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const from = req.query.from;
        const to = req.query.to;
        const device = await prisma_1.prisma.device.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!device)
            throw new errors_1.NotFoundError('Device', req.params.id);
        const where = { deviceId: device.id };
        if (from)
            where.dayDate = { ...where.dayDate, gte: new Date(from) };
        if (to)
            where.dayDate = { ...where.dayDate, lte: new Date(to) };
        const rollups = await prisma_1.prisma.dailyRollup.findMany({
            where,
            orderBy: { dayDate: 'asc' },
        });
        res.json(rollups);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/tenants/{tenantId}/dashboard/summary:
 *   get:
 *     tags: [Analytics]
 *     summary: Get tenant dashboard summary with KPIs
 */
router.get('/tenants/:tenantId/dashboard/summary', middleware_1.authenticateUser, middleware_1.loadUserContext, async (req, res, next) => {
    try {
        const tenantId = req.params.tenantId;
        // Device counts by status
        const devicesByStatus = await prisma_1.prisma.device.groupBy({
            by: ['status'],
            where: { tenantId },
            _count: true,
        });
        const totalDevices = devicesByStatus.reduce((sum, g) => sum + g._count, 0);
        // Online percentage (devices seen in last 30 min)
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
        const onlineCount = await prisma_1.prisma.device.count({
            where: { tenantId, lastSeenAt: { gte: thirtyMinAgo } },
        });
        // Active alerts
        const activeAlerts = await prisma_1.prisma.alertEvent.count({
            where: { tenantId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        });
        const alertsBySeverity = await prisma_1.prisma.alertEvent.groupBy({
            by: ['severity'],
            where: { tenantId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
            _count: true,
        });
        // Today's energy estimate
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayRollups = await prisma_1.prisma.dailyRollup.aggregate({
            where: { tenantId, dayDate: { gte: today } },
            _sum: { energyKwhDay: true },
        });
        // Sites count
        const sitesCount = await prisma_1.prisma.site.count({ where: { tenantId } });
        res.json({
            totalDevices,
            devicesByStatus: Object.fromEntries(devicesByStatus.map(g => [g.status, g._count])),
            onlineCount,
            onlinePercentage: totalDevices > 0 ? Math.round((onlineCount / totalDevices) * 100) : 0,
            activeAlerts,
            alertsBySeverity: Object.fromEntries(alertsBySeverity.map(g => [g.severity, g._count])),
            todayEnergyKwh: todayRollups._sum?.energyKwhDay || 0,
            sitesCount,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
// ─── ROLLUP JOB ─────────────────────────────────────────────────────────────
async function computeDailyRollups(targetDate) {
    const date = targetDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const devices = await prisma_1.prisma.device.findMany({
        where: { status: { in: ['ACTIVE', 'INSTALLED'] } },
        select: { id: true, tenantId: true },
    });
    let count = 0;
    for (const device of devices) {
        const telemetry = await prisma_1.prisma.telemetry.findMany({
            where: { deviceId: device.id, ts: { gte: dayStart, lt: dayEnd } },
            orderBy: { ts: 'asc' },
        });
        if (telemetry.length === 0)
            continue;
        let energyKwh = 0;
        let waterLiters = 0;
        let heaterOnMinutes = 0;
        const tankTemps = [];
        const ambientTemps = [];
        for (let i = 0; i < telemetry.length; i++) {
            const m = telemetry[i].metrics;
            const intervalMinutes = i > 0
                ? (new Date(telemetry[i].ts).getTime() - new Date(telemetry[i - 1].ts).getTime()) / 60000
                : 5;
            if (m.powerW !== undefined) {
                energyKwh += (m.powerW / 1000) * (intervalMinutes / 60);
            }
            if (m.flowLpm !== undefined) {
                waterLiters += m.flowLpm * intervalMinutes;
            }
            if (m.heaterOn === true) {
                heaterOnMinutes += intervalMinutes;
            }
            if (m.tankTempC !== undefined)
                tankTemps.push(m.tankTempC);
            if (m.ambientTempC !== undefined)
                ambientTemps.push(m.ambientTempC);
        }
        await prisma_1.prisma.dailyRollup.upsert({
            where: { deviceId_dayDate: { deviceId: device.id, dayDate: dayStart } },
            create: {
                tenantId: device.tenantId,
                deviceId: device.id,
                dayDate: dayStart,
                energyKwhDay: Math.round(energyKwh * 100) / 100,
                hotWaterUsageLitersDay: Math.round(waterLiters * 100) / 100,
                heaterOnMinutesDay: Math.round(heaterOnMinutes),
                tankTempMinC: tankTemps.length > 0 ? Math.min(...tankTemps) : null,
                tankTempMaxC: tankTemps.length > 0 ? Math.max(...tankTemps) : null,
                ambientTempAvgC: ambientTemps.length > 0
                    ? Math.round((ambientTemps.reduce((a, b) => a + b, 0) / ambientTemps.length) * 10) / 10
                    : null,
            },
            update: {
                energyKwhDay: Math.round(energyKwh * 100) / 100,
                hotWaterUsageLitersDay: Math.round(waterLiters * 100) / 100,
                heaterOnMinutesDay: Math.round(heaterOnMinutes),
                tankTempMinC: tankTemps.length > 0 ? Math.min(...tankTemps) : null,
                tankTempMaxC: tankTemps.length > 0 ? Math.max(...tankTemps) : null,
                ambientTempAvgC: ambientTemps.length > 0
                    ? Math.round((ambientTemps.reduce((a, b) => a + b, 0) / ambientTemps.length) * 10) / 10
                    : null,
            },
        });
        count++;
    }
    return count;
}
//# sourceMappingURL=router.js.map