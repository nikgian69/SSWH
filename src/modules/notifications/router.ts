import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { NotFoundError } from '../../common/errors';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

const createChannelSchema = z.object({
  type: z.enum(['EMAIL', 'SMS', 'WEBHOOK']),
  config: z.record(z.unknown()),
  enabled: z.boolean().optional(),
});

const updateChannelSchema = z.object({
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
}).partial();

router.post(
  '/channels',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(createChannelSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const channel = await prisma.notificationChannel.create({
        data: { ...req.body, tenantId: req.tenantId! },
      });
      res.status(201).json(channel);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/channels',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const channels = await prisma.notificationChannel.findMany({
        where: { tenantId: req.tenantId! },
      });
      res.json(channels);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/channels/:id',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(updateChannelSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const channel = await prisma.notificationChannel.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
      });
      if (!channel) throw new NotFoundError('NotificationChannel', req.params.id);

      const updated = await prisma.notificationChannel.update({
        where: { id: channel.id },
        data: req.body,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/events',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = (req.query.limit as string) || '50';
      const where: any = { tenantId: req.tenantId! };
      if (status) where.status = status;

      const events = await prisma.notificationEvent.findMany({
        where,
        include: {
          channel: { select: { type: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit), 200),
      });
      res.json(events);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

// ─── NOTIFICATION PROCESSING JOB ────────────────────────────────────────────

export async function processNotificationQueue(): Promise<number> {
  const queued = await prisma.notificationEvent.findMany({
    where: { status: 'QUEUED' },
    include: { channel: true },
    take: 100,
  });

  let processed = 0;
  for (const event of queued) {
    try {
      const channelConfig = event.channel.config as any;

      switch (event.channel.type) {
        case 'EMAIL':
          console.log(`[EMAIL STUB] Sending to ${channelConfig.to || 'admin'}: Alert ${event.alertEventId}`);
          break;
        case 'SMS':
          console.log(`[SMS STUB] Sending to ${channelConfig.phone || 'admin'}: Alert ${event.alertEventId}`);
          break;
        case 'WEBHOOK':
          console.log(`[WEBHOOK STUB] POST to ${channelConfig.url || 'unknown'}: Alert ${event.alertEventId}`);
          break;
      }

      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      processed++;
    } catch (err: any) {
      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED', errorMsg: err.message },
      });
    }
  }

  return processed;
}
