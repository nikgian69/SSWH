"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../common/prisma");
const validation_1 = require("../../common/validation");
const audit_1 = require("../../common/audit");
const errors_1 = require("../../common/errors");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
// Plausible ranges for validation
const METRIC_RANGES = {
    tankTempC: { min: -10, max: 120 },
    ambientTempC: { min: -50, max: 70 },
    humidityPct: { min: 0, max: 100 },
    lux: { min: 0, max: 200000 },
    flowLpm: { min: 0, max: 50 },
    powerW: { min: 0, max: 10000 },
    batteryPct: { min: 0, max: 100 },
    rssiDbm: { min: -130, max: 0 },
};
const telemetrySchema = zod_1.z.object({
    deviceId: zod_1.z.string().uuid(),
    ts: zod_1.z.string().datetime(),
    metrics: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.number(), zod_1.z.boolean(), zod_1.z.string()])),
    geo: zod_1.z.object({
        lat: zod_1.z.number().min(-90).max(90),
        lon: zod_1.z.number().min(-180).max(180),
        accuracyM: zod_1.z.number().optional(),
        source: zod_1.z.enum(['EDGE_GNSS', 'EDGE_CELL']),
    }).optional(),
});
function validateMetricRanges(metrics) {
    const warnings = [];
    for (const [key, value] of Object.entries(metrics)) {
        if (typeof value !== 'number')
            continue;
        const range = METRIC_RANGES[key];
        if (range && (value < range.min || value > range.max)) {
            warnings.push(`${key}=${value} out of plausible range [${range.min}, ${range.max}]`);
        }
    }
    return warnings;
}
function computeDerivedState(metrics, geo, existingState) {
    const state = { ...existingState };
    // Update last known sensor values
    for (const [key, value] of Object.entries(metrics)) {
        state[`last_${key}`] = value;
    }
    // Computed fields
    state.isOnline = true;
    state.lastRssi = metrics.rssiDbm ?? state.lastRssi;
    state.lastTankTempC = metrics.tankTempC ?? state.lastTankTempC;
    state.lastAmbientTempC = metrics.ambientTempC ?? state.lastAmbientTempC;
    state.heaterOn = metrics.heaterOn ?? state.heaterOn;
    state.lastPowerW = metrics.powerW ?? state.lastPowerW;
    // Simple health score (0-100)
    let health = 100;
    if (metrics.rssiDbm !== undefined && metrics.rssiDbm < -100)
        health -= 20;
    if (metrics.batteryPct !== undefined && metrics.batteryPct < 20)
        health -= 30;
    if (metrics.tankTempC !== undefined && metrics.tankTempC > 85)
        health -= 20;
    state.healthScore = Math.max(0, health);
    if (geo) {
        state.lastGeoLat = geo.lat;
        state.lastGeoLon = geo.lon;
        state.lastGeoSource = geo.source;
    }
    return state;
}
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
/**
 * @openapi
 * /api/ingest/telemetry:
 *   post:
 *     tags: [Telemetry]
 *     summary: Ingest telemetry from a device
 *     security:
 *       - DeviceAuth: []
 */
router.post('/', middleware_1.authenticateDevice, (0, validation_1.validate)(telemetrySchema), async (req, res, next) => {
    try {
        const { deviceId, ts, metrics, geo } = req.body;
        // Verify device matches auth
        if (req.deviceId !== deviceId) {
            throw new errors_1.ValidationError('Device ID mismatch with authentication');
        }
        // Fetch device with site
        const device = await prisma_1.prisma.device.findUnique({
            where: { id: deviceId },
            include: { site: true },
        });
        if (!device)
            throw new errors_1.NotFoundError('Device', deviceId);
        // Validate metric ranges
        const warnings = validateMetricRanges(metrics);
        if (warnings.length > 0) {
            console.warn(`Telemetry warnings for device ${deviceId}:`, warnings);
        }
        // Store telemetry
        const telemetry = await prisma_1.prisma.telemetry.create({
            data: {
                deviceId,
                ts: new Date(ts),
                metrics,
                geo: geo || undefined,
            },
        });
        // Update Device.lastSeenAt
        const deviceUpdate = { lastSeenAt: new Date(ts) };
        // Update device geo if present
        if (geo) {
            deviceUpdate.deviceLat = geo.lat;
            deviceUpdate.deviceLon = geo.lon;
            deviceUpdate.deviceLocationTs = new Date(ts);
            deviceUpdate.deviceLocationSource = geo.source;
            deviceUpdate.deviceLocationAccuracyM = geo.accuracyM;
        }
        await prisma_1.prisma.device.update({ where: { id: deviceId }, data: deviceUpdate });
        // Update DeviceTwin
        const twin = await prisma_1.prisma.deviceTwin.findUnique({ where: { deviceId } });
        const existingState = twin?.derivedState || {};
        const newState = computeDerivedState(metrics, geo, existingState);
        await prisma_1.prisma.deviceTwin.upsert({
            where: { deviceId },
            create: { deviceId, lastTs: new Date(ts), derivedState: newState },
            update: { lastTs: new Date(ts), derivedState: newState },
        });
        // Handle site geo update logic
        if (geo && device.siteId && device.site) {
            const site = device.site;
            const shouldUpdateSite = !site.locationLock && ((site.lat === null && site.lon === null) ||
                (site.lat === null) // auto-populate if null
            );
            if (shouldUpdateSite) {
                const isFirstLocation = site.lat === null;
                await prisma_1.prisma.site.update({
                    where: { id: site.id },
                    data: {
                        lat: geo.lat,
                        lon: geo.lon,
                        locationSource: geo.source,
                        locationAccuracyM: geo.accuracyM,
                        locationUpdatedAt: new Date(),
                    },
                });
                if (isFirstLocation) {
                    await (0, audit_1.writeAuditLog)({
                        tenantId: device.tenantId,
                        actorType: 'DEVICE',
                        action: 'SITE_LOCATION_SET_FROM_DEVICE',
                        entityType: 'Site',
                        entityId: site.id,
                        metadata: { deviceId, lat: geo.lat, lon: geo.lon, source: geo.source },
                    });
                }
            }
            // Audit large geo jumps (> 1km)
            if (site.lat !== null && site.lon !== null) {
                const distance = haversineKm(site.lat, site.lon, geo.lat, geo.lon);
                if (distance > 1) {
                    await (0, audit_1.writeAuditLog)({
                        tenantId: device.tenantId,
                        actorType: 'DEVICE',
                        action: 'DEVICE_GEO_LARGE_JUMP',
                        entityType: 'Device',
                        entityId: deviceId,
                        metadata: { distanceKm: distance, oldLat: site.lat, oldLon: site.lon, newLat: geo.lat, newLon: geo.lon },
                    });
                }
            }
        }
        res.status(201).json({
            id: telemetry.id,
            warnings: warnings.length > 0 ? warnings : undefined,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/devices/{id}/telemetry:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get telemetry history for a device
 */
exports.default = router;
//# sourceMappingURL=router.js.map