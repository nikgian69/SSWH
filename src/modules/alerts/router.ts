import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { NotFoundError } from '../../common/errors';
import { config } from '../../common/config';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

// ─── ALERT RULES CRUD ──────────────────────────────────────────────────────

const createAlertRuleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['NO_TELEMETRY', 'OVER_TEMP', 'POSSIBLE_LEAK', 'SENSOR_OUT_OF_RANGE']),
  params: z.record(z.string(), z.unknown()),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  enabled: z.boolean().optional(),
});

router.post(
  '/rules',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(createAlertRuleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rule = await prisma.alertRule.create({
        data: { ...req.body, tenantId: req.tenantId! },
      });
      res.status(201).json(rule);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/rules',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rules = await prisma.alertRule.findMany({
        where: { tenantId: req.tenantId! },
        orderBy: { createdAt: 'desc' },
      });
      res.json(rules);
    } catch (err) {
      next(err);
    }
  }
);

// ─── ALERT EVENTS ───────────────────────────────────────────────────────────

router.get(
  '/',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status as string | undefined;
      const severity = req.query.severity as string | undefined;
      const deviceId = req.query.deviceId as string | undefined;
      const limit = (req.query.limit as string) || '50';
      const offset = (req.query.offset as string) || '0';

      const where: any = { tenantId: req.tenantId! };
      if (status) where.status = status;
      if (severity) where.severity = severity;
      if (deviceId) where.deviceId = deviceId;

      const [events, total] = await Promise.all([
        prisma.alertEvent.findMany({
          where,
          include: {
            rule: { select: { name: true, type: true } },
            device: { select: { serialNumber: true, name: true } },
          },
          orderBy: { openedAt: 'desc' },
          take: Math.min(parseInt(limit), 200),
          skip: parseInt(offset),
        }),
        prisma.alertEvent.count({ where }),
      ]);

      res.json({ events, total });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/ack',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const alert = await prisma.alertEvent.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
      });
      if (!alert) throw new NotFoundError('AlertEvent', req.params.id);

      const updated = await prisma.alertEvent.update({
        where: { id: alert.id },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
      });

      await writeAuditLog({
        tenantId: req.tenantId!,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'ALERT_ACKNOWLEDGED',
        entityType: 'AlertEvent',
        entityId: alert.id,
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/close',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const alert = await prisma.alertEvent.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
      });
      if (!alert) throw new NotFoundError('AlertEvent', req.params.id);

      const updated = await prisma.alertEvent.update({
        where: { id: alert.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      await writeAuditLog({
        tenantId: req.tenantId!,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'ALERT_CLOSED',
        entityType: 'AlertEvent',
        entityId: alert.id,
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

// ─── ALERT EVALUATION ENGINE ────────────────────────────────────────────────

export async function evaluateAlerts(): Promise<number> {
  let alertsCreated = 0;
  const rules = await prisma.alertRule.findMany({ where: { enabled: true } });

  for (const rule of rules) {
    const devices = await prisma.device.findMany({
      where: { tenantId: rule.tenantId, status: { in: ['ACTIVE', 'INSTALLED'] } },
    });

    for (const device of devices) {
      try {
        let shouldAlert = false;
        let details: any = {};
        const dedupeKey = `${device.id}:${rule.id}`;

        const existingOpen = await prisma.alertEvent.findFirst({
          where: { dedupeKey, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        });
        if (existingOpen) continue;

        const params = rule.params as any;

        switch (rule.type) {
          case 'NO_TELEMETRY': {
            const thresholdMin = params.thresholdMinutes || config.noTelemetryThresholdMinutes;
            const threshold = new Date(Date.now() - thresholdMin * 60 * 1000);
            if (!device.lastSeenAt || device.lastSeenAt < threshold) {
              shouldAlert = true;
              details = { lastSeenAt: device.lastSeenAt, thresholdMinutes: thresholdMin };
            }
            break;
          }
          case 'OVER_TEMP': {
            const twin = await prisma.deviceTwin.findUnique({ where: { deviceId: device.id } });
            const state = twin?.derivedState as any;
            const threshold = params.thresholdC || config.overTempThresholdC;
            if (state?.lastTankTempC && state.lastTankTempC > threshold) {
              shouldAlert = true;
              details = { tankTempC: state.lastTankTempC, thresholdC: threshold };
            }
            break;
          }
          case 'POSSIBLE_LEAK': {
            const lookbackMin = params.lookbackMinutes || 60;
            const since = new Date(Date.now() - lookbackMin * 60 * 1000);
            const recentTelemetry = await prisma.telemetry.findMany({
              where: { deviceId: device.id, ts: { gte: since } },
              orderBy: { ts: 'desc' },
              take: 10,
            });
            const allFlowing = recentTelemetry.length >= 5 &&
              recentTelemetry.every(t => {
                const m = t.metrics as any;
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
            const repeatCount = params.repeatCount || config.sensorOutOfRangeRepeatCount;
            const recent = await prisma.telemetry.findMany({
              where: { deviceId: device.id },
              orderBy: { ts: 'desc' },
              take: repeatCount,
            });
            const outOfRange = recent.filter(t => {
              const val = (t.metrics as any)?.[metricName];
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
          const alertEvent = await prisma.alertEvent.create({
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
      } catch (err) {
        console.error(`Alert evaluation error for device ${device.id}, rule ${rule.id}:`, err);
      }
    }
  }

  return alertsCreated;
}

async function dispatchAlertNotifications(tenantId: string, alertEventId: string, severity: string): Promise<void> {
  const channels = await prisma.notificationChannel.findMany({
    where: { tenantId, enabled: true },
  });

  for (const channel of channels) {
    if (channel.type === 'WEBHOOK' || severity !== 'INFO') {
      await prisma.notificationEvent.create({
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
