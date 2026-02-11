import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { NotFoundError, ForbiddenError } from '../../common/errors';
import { requireEntitlement } from '../entitlements/router';
import {
  AuthenticatedRequest,
  authenticateUser,
  authenticateDevice,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

const createCommandSchema = z.object({
  type: z.enum(['REMOTE_BOOST_SET', 'SET_SCHEDULE', 'SET_CONFIG']),
  payload: z.record(z.unknown()),
});

const ackCommandSchema = z.object({
  status: z.enum(['ACKED', 'FAILED']),
  errorMsg: z.string().optional(),
});

router.post(
  '/:id/commands',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN', 'INSTALLER', 'SUPPORT_AGENT', 'END_USER'),
  requireEntitlement('BASIC_REMOTE_BOOST'),
  validate(createCommandSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const device = await prisma.device.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
      });
      if (!device) throw new NotFoundError('Device', req.params.id);

      const command = await prisma.command.create({
        data: {
          deviceId: device.id,
          type: req.body.type,
          payload: req.body.payload,
          status: 'QUEUED',
          requestedByUserId: req.user!.userId,
          requestedAt: new Date(),
        },
      });

      await writeAuditLog({
        tenantId: req.tenantId!,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'COMMAND_CREATED',
        entityType: 'Command',
        entityId: command.id,
        metadata: { type: command.type, deviceId: device.id },
      });

      res.status(201).json(command);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id/commands',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status as string | undefined;
      const device = await prisma.device.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
      });
      if (!device) throw new NotFoundError('Device', req.params.id);

      const where: any = { deviceId: device.id };
      if (status) where.status = status;

      const commands = await prisma.command.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        take: 50,
      });

      res.json(commands);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id/commands/pending',
  authenticateDevice,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.deviceId !== req.params.id) {
        throw new ForbiddenError('Device ID mismatch');
      }

      const commands = await prisma.command.findMany({
        where: { deviceId: req.params.id, status: 'QUEUED' },
        orderBy: { requestedAt: 'asc' },
      });

      if (commands.length > 0) {
        await prisma.command.updateMany({
          where: { id: { in: commands.map(c => c.id) } },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
      }

      res.json(commands);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/commands/:commandId/ack',
  authenticateDevice,
  validate(ackCommandSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.deviceId !== req.params.id) {
        throw new ForbiddenError('Device ID mismatch');
      }

      const command = await prisma.command.findFirst({
        where: { id: req.params.commandId, deviceId: req.params.id },
      });
      if (!command) throw new NotFoundError('Command', req.params.commandId);

      const updated = await prisma.command.update({
        where: { id: command.id },
        data: {
          status: req.body.status,
          ackAt: new Date(),
          errorMsg: req.body.errorMsg || null,
        },
      });

      const device = await prisma.device.findUnique({ where: { id: req.params.id } });

      await writeAuditLog({
        tenantId: device?.tenantId,
        actorType: 'DEVICE',
        action: `COMMAND_${req.body.status}`,
        entityType: 'Command',
        entityId: command.id,
        metadata: { deviceId: req.params.id, status: req.body.status, errorMsg: req.body.errorMsg },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
