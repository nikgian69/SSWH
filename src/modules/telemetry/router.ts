import { Router, Response, NextFunction, Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { ValidationError, NotFoundError } from '../../common/errors';
import { AuthenticatedRequest, authenticateDevice } from '../../common/middleware';

const router = Router();

// Plausible ranges for validation
const METRIC_RANGES: Record<string, { min: number; max: number }> = {
  tankTempC: { min: -10, max: 120 },
  ambientTempC: { min: -50, max: 70 },
  humidityPct: { min: 0, max: 100 },
  lux: { min: 0, max: 200000 },
  flowLpm: { min: 0, max: 50 },
  powerW: { min: 0, max: 10000 },
  batteryPct: { min: 0, max: 100 },
  rssiDbm: { min: -130, max: 0 },
};

const telemetrySchema = z.object({
  deviceId: z.string().uuid(),
  ts: z.string().datetime(),
  metrics: z.record(z.union([z.number(), z.boolean(), z.string()])),
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    accuracyM: z.number().optional(),
    source: z.enum(['EDGE_GNSS', 'EDGE_CELL']),
  }).optional(),
});

function validateMetricRanges(metrics: Record<string, any>): string[] {
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value !== 'number') continue;
    const range = METRIC_RANGES[key];
    if (range && (value < range.min || value > range.max)) {
      warnings.push(`${key}=${value} out of plausible range [${range.min}, ${range.max}]`);
    }
  }
  return warnings;
}

function computeDerivedState(metrics: Record<string, any>, geo: any, existingState: any): any {
  const state: any = { ...existingState };

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
  if (metrics.rssiDbm !== undefined && metrics.rssiDbm < -100) health -= 20;
  if (metrics.batteryPct !== undefined && metrics.batteryPct < 20) health -= 30;
  if (metrics.tankTempC !== undefined && metrics.tankTempC > 85) health -= 20;
  state.healthScore = Math.max(0, health);

  if (geo) {
    state.lastGeoLat = geo.lat;
    state.lastGeoLon = geo.lon;
    state.lastGeoSource = geo.source;
  }

  return state;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
router.post(
  '/',
  authenticateDevice,
  validate(telemetrySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { deviceId, ts, metrics, geo } = req.body;

      // Verify device matches auth
      if (req.deviceId !== deviceId) {
        throw new ValidationError('Device ID mismatch with authentication');
      }

      // Fetch device with site
      const device = await prisma.device.findUnique({
        where: { id: deviceId },
        include: { site: true },
      });
      if (!device) throw new NotFoundError('Device', deviceId);

      // Validate metric ranges
      const warnings = validateMetricRanges(metrics);
      if (warnings.length > 0) {
        console.warn(`Telemetry warnings for device ${deviceId}:`, warnings);
      }

      // Store telemetry
      const telemetry = await prisma.telemetry.create({
        data: {
          deviceId,
          ts: new Date(ts),
          metrics,
          geo: geo || undefined,
        },
      });

      // Update Device.lastSeenAt
      const deviceUpdate: any = { lastSeenAt: new Date(ts) };

      // Update device geo if present
      if (geo) {
        deviceUpdate.deviceLat = geo.lat;
        deviceUpdate.deviceLon = geo.lon;
        deviceUpdate.deviceLocationTs = new Date(ts);
        deviceUpdate.deviceLocationSource = geo.source;
        deviceUpdate.deviceLocationAccuracyM = geo.accuracyM;
      }

      await prisma.device.update({ where: { id: deviceId }, data: deviceUpdate });

      // Update DeviceTwin
      const twin = await prisma.deviceTwin.findUnique({ where: { deviceId } });
      const existingState = (twin?.derivedState as any) || {};
      const newState = computeDerivedState(metrics, geo, existingState);

      await prisma.deviceTwin.upsert({
        where: { deviceId },
        create: { deviceId, lastTs: new Date(ts), derivedState: newState },
        update: { lastTs: new Date(ts), derivedState: newState },
      });

      // Handle site geo update logic
      if (geo && device.siteId && device.site) {
        const site = device.site;
        const shouldUpdateSite =
          !site.locationLock && (
            (site.lat === null && site.lon === null) ||
            (site.lat === null) // auto-populate if null
          );

        if (shouldUpdateSite) {
          const isFirstLocation = site.lat === null;
          await prisma.site.update({
            where: { id: site.id },
            data: {
              lat: geo.lat,
              lon: geo.lon,
              locationSource: geo.source as any,
              locationAccuracyM: geo.accuracyM,
              locationUpdatedAt: new Date(),
            },
          });

          if (isFirstLocation) {
            await writeAuditLog({
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
            await writeAuditLog({
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
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/devices/{id}/telemetry:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get telemetry history for a device
 */

export default router;
