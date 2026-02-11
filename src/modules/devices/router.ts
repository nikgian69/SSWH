import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import multer from 'multer';
import { prisma } from '../../common/prisma';
import { config } from '../../common/config';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { NotFoundError, ValidationError, ConflictError } from '../../common/errors';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const registerDeviceSchema = z.object({
  serialNumber: z.string().min(1),
  model: z.string().min(1),
  firmwareVersion: z.string().optional(),
  simIccid: z.string().optional(),
  siteId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  name: z.string().optional(),
});

const updateDeviceSchema = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  tags: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['PROVISIONED', 'INSTALLED', 'ACTIVE', 'SUSPENDED', 'RETIRED']).optional(),
  siteId: z.string().uuid().nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
}).partial();

/**
 * @openapi
 * /api/devices:
 *   post:
 *     tags: [Devices]
 *     summary: Register a single device
 */
router.post(
  '/',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN', 'INSTALLER'),
  validate(registerDeviceSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const { serialNumber, model, firmwareVersion, simIccid, siteId, ownerUserId, name } = req.body;

      // Check unique serial within tenant
      const existing = await prisma.device.findUnique({
        where: { tenantId_serialNumber: { tenantId, serialNumber } },
      });
      if (existing) throw new ConflictError(`Device with serial '${serialNumber}' already exists in this tenant`);

      // Create device
      const device = await prisma.device.create({
        data: {
          tenantId,
          serialNumber,
          model,
          firmwareVersion,
          simIccid,
          siteId,
          ownerUserId,
          name,
          status: 'PROVISIONED',
        },
      });

      // Generate device secret
      const hmac = crypto.createHmac('sha256', config.deviceHmacSecret).update(device.id).digest('hex');
      await prisma.deviceSecret.create({
        data: {
          deviceId: device.id,
          secretHash: hmac,
        },
      });

      // Create device twin
      await prisma.deviceTwin.create({
        data: {
          deviceId: device.id,
          derivedState: { isOnline: false, healthScore: 0 },
        },
      });

      await writeAuditLog({
        tenantId,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'DEVICE_REGISTERED',
        entityType: 'Device',
        entityId: device.id,
        metadata: { serialNumber, model },
      });

      // Return device with token for provisioning
      const deviceToken = `${device.id}:${hmac}`;
      res.status(201).json({ device, deviceToken });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/devices/bulk:
 *   post:
 *     tags: [Devices]
 *     summary: Bulk register devices via CSV upload
 */
router.post(
  '/bulk',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      if (!req.file) throw new ValidationError('CSV file is required');

      const records = parse(req.file.buffer.toString(), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<{ serialNumber: string; model: string; firmwareVersion?: string; simIccid?: string }>;

      const results: Array<{ serialNumber: string; status: string; deviceId?: string; error?: string }> = [];

      for (const record of records) {
        try {
          const existing = await prisma.device.findUnique({
            where: { tenantId_serialNumber: { tenantId, serialNumber: record.serialNumber } },
          });
          if (existing) {
            results.push({ serialNumber: record.serialNumber, status: 'SKIPPED', error: 'Already exists' });
            continue;
          }

          const device = await prisma.device.create({
            data: {
              tenantId,
              serialNumber: record.serialNumber,
              model: record.model,
              firmwareVersion: record.firmwareVersion || null,
              simIccid: record.simIccid || null,
              status: 'PROVISIONED',
            },
          });

          const hmac = crypto.createHmac('sha256', config.deviceHmacSecret).update(device.id).digest('hex');
          await prisma.deviceSecret.create({ data: { deviceId: device.id, secretHash: hmac } });
          await prisma.deviceTwin.create({ data: { deviceId: device.id, derivedState: { isOnline: false } } });

          results.push({ serialNumber: record.serialNumber, status: 'CREATED', deviceId: device.id });
        } catch (err: any) {
          results.push({ serialNumber: record.serialNumber, status: 'FAILED', error: err.message });
        }
      }

      await writeAuditLog({
        tenantId,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'DEVICES_BULK_REGISTERED',
        entityType: 'Device',
        entityId: 'bulk',
        metadata: { count: records.length, created: results.filter(r => r.status === 'CREATED').length },
      });

      res.status(201).json({ total: records.length, results });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/devices:
 *   get:
 *     tags: [Devices]
 *     summary: List/search devices
 */
router.get(
  '/',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const siteId = req.query.siteId as string | undefined;
      const model = req.query.model as string | undefined;
      const status = req.query.status as string | undefined;
      const firmwareVersion = req.query.firmwareVersion as string | undefined;
      const search = req.query.search as string | undefined;
      const limit = (req.query.limit as string) || '50';
      const offset = (req.query.offset as string) || '0';
      const where: any = { tenantId: req.tenantId! };

      if (siteId) where.siteId = siteId;
      if (model) where.model = model;
      if (status) where.status = status;
      if (firmwareVersion) where.firmwareVersion = firmwareVersion;
      if (search) {
        where.OR = [
          { serialNumber: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [devices, total] = await Promise.all([
        prisma.device.findMany({
          where,
          include: {
            site: { select: { id: true, name: true } },
            twin: { select: { derivedState: true, lastTs: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: Math.min(parseInt(limit), 200),
          skip: parseInt(offset),
        }),
        prisma.device.count({ where }),
      ]);

      res.json({ devices, total, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/devices/{id}:
 *   get:
 *     tags: [Devices]
 *     summary: Get device detail with twin and latest telemetry
 */
router.get(
  '/:id',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const device = await prisma.device.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
        include: {
          site: true,
          twin: true,
          sim: true,
          entitlements: true,
        },
      });
      if (!device) throw new NotFoundError('Device', req.params.id);

      // Get latest telemetry
      const latestTelemetry = await prisma.telemetry.findFirst({
        where: { deviceId: device.id },
        orderBy: { ts: 'desc' },
      });

      res.json({ ...device, latestTelemetry });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/devices/{id}:
 *   patch:
 *     tags: [Devices]
 *     summary: Update device metadata, status, or assignment
 */
router.patch(
  '/:id',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN', 'INSTALLER'),
  validate(updateDeviceSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const device = await prisma.device.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
      });
      if (!device) throw new NotFoundError('Device', req.params.id);

      const updated = await prisma.device.update({
        where: { id: device.id },
        data: req.body,
      });

      const action = req.body.siteId !== undefined ? 'DEVICE_REASSIGNED' :
                     req.body.status ? 'DEVICE_STATUS_CHANGED' : 'DEVICE_UPDATED';

      await writeAuditLog({
        tenantId: req.tenantId!,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action,
        entityType: 'Device',
        entityId: device.id,
        metadata: { changes: req.body, previous: { siteId: device.siteId, status: device.status } },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
