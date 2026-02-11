import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { NotFoundError, ForbiddenError } from '../../common/errors';
import {
  AuthenticatedRequest,
  authenticateUser,
  authenticateDevice,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

// ─── FIRMWARE PACKAGES ──────────────────────────────────────────────────────

const createFirmwareSchema = z.object({
  version: z.string().min(1),
  fileUrl: z.string().url(),
  checksum: z.string().min(1),
  releaseNotes: z.string().optional(),
});

router.post(
  '/firmware',
  authenticateUser,
  loadUserContext,
  requireRoles('PLATFORM_ADMIN'),
  validate(createFirmwareSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const firmware = await prisma.firmwarePackage.create({ data: req.body });
      await writeAuditLog({
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'FIRMWARE_REGISTERED',
        entityType: 'FirmwarePackage',
        entityId: firmware.id,
        metadata: { version: firmware.version },
      });
      res.status(201).json(firmware);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/firmware',
  authenticateUser,
  loadUserContext,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const packages = await prisma.firmwarePackage.findMany({ orderBy: { createdAt: 'desc' } });
      res.json(packages);
    } catch (err) {
      next(err);
    }
  }
);

// ─── OTA JOBS ───────────────────────────────────────────────────────────────

const createOtaJobSchema = z.object({
  targetType: z.enum(['DEVICE', 'GROUP']),
  deviceId: z.string().uuid().optional(),
  groupFilter: z.record(z.string(), z.unknown()).optional(),
  firmwarePackageId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
});

router.post(
  '/jobs',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(createOtaJobSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { targetType, deviceId, groupFilter, firmwarePackageId, scheduledAt } = req.body;

      const firmware = await prisma.firmwarePackage.findUnique({ where: { id: firmwarePackageId } });
      if (!firmware) throw new NotFoundError('FirmwarePackage', firmwarePackageId);

      const job = await prisma.otaJob.create({
        data: {
          tenantId: req.tenantId!,
          targetType,
          deviceId: deviceId || null,
          groupFilter: groupFilter || null,
          firmwarePackageId,
          status: 'SCHEDULED',
          scheduledAt: new Date(scheduledAt),
          createdByUserId: req.user!.userId,
        },
      });

      await writeAuditLog({
        tenantId: req.tenantId!,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'OTA_JOB_SCHEDULED',
        entityType: 'OtaJob',
        entityId: job.id,
        metadata: { targetType, firmwareVersion: firmware.version },
      });

      res.status(201).json(job);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/jobs',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const jobs = await prisma.otaJob.findMany({
        where: { tenantId: req.tenantId! },
        include: { firmwarePackage: { select: { version: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json(jobs);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/jobs/:id',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const job = await prisma.otaJob.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
      });
      if (!job) throw new NotFoundError('OtaJob', req.params.id);

      const { status } = req.body;
      const updated = await prisma.otaJob.update({
        where: { id: job.id },
        data: {
          status,
          ...(status === 'CANCELED' ? { finishedAt: new Date() } : {}),
          ...(status === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
        },
      });

      await writeAuditLog({
        tenantId: req.tenantId!,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: `OTA_JOB_${status}`,
        entityType: 'OtaJob',
        entityId: job.id,
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ─── DEVICE-SIDE OTA ENDPOINTS ──────────────────────────────────────────────

router.get(
  '/devices/:id/ota/pending',
  authenticateDevice,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.deviceId !== req.params.id) {
        throw new ForbiddenError('Device ID mismatch');
      }

      const device = await prisma.device.findUnique({ where: { id: req.params.id } });
      if (!device) throw new NotFoundError('Device', req.params.id);

      const jobs = await prisma.otaJob.findMany({
        where: {
          tenantId: device.tenantId,
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          OR: [
            { targetType: 'DEVICE', deviceId: device.id },
            { targetType: 'GROUP' },
          ],
        },
        include: { firmwarePackage: true },
        orderBy: { scheduledAt: 'asc' },
        take: 1,
      });

      res.json(jobs.length > 0 ? jobs[0] : null);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/devices/:id/ota/report',
  authenticateDevice,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.deviceId !== req.params.id) {
        throw new ForbiddenError('Device ID mismatch');
      }

      const { jobId, status, progress, errorMsg } = req.body;

      const job = await prisma.otaJob.findUnique({ where: { id: jobId } });
      if (!job) throw new NotFoundError('OtaJob', jobId);

      const updateData: any = { progress };
      if (status === 'SUCCESS' || status === 'FAILED') {
        updateData.status = status;
        updateData.finishedAt = new Date();
      }
      if (status === 'IN_PROGRESS' && job.status === 'SCHEDULED') {
        updateData.status = 'IN_PROGRESS';
        updateData.startedAt = new Date();
      }

      const updated = await prisma.otaJob.update({ where: { id: jobId }, data: updateData });

      if (status === 'SUCCESS') {
        const firmware = await prisma.firmwarePackage.findUnique({ where: { id: job.firmwarePackageId } });
        if (firmware) {
          await prisma.device.update({
            where: { id: req.params.id },
            data: { firmwareVersion: firmware.version },
          });
        }
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
