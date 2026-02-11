import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { NotFoundError, ForbiddenError } from '../../common/errors';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

const createSiteSchema = z.object({
  name: z.string().min(1),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  locationSource: z.enum(['MOBILE_GPS', 'EDGE_GNSS', 'EDGE_CELL', 'MANUAL']).optional(),
  locationAccuracyM: z.number().optional(),
  locationLock: z.boolean().optional(),
});

const updateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracyM: z.number().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  source: z.enum(['MOBILE_GPS', 'MANUAL']),
  lock: z.boolean().optional(),
});

/**
 * @openapi
 * /api/sites:
 *   post:
 *     tags: [Sites]
 *     summary: Create a new site
 */
router.post(
  '/',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN', 'INSTALLER'),
  validate(createSiteSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const site = await prisma.site.create({
        data: {
          ...req.body,
          tenantId: req.tenantId!,
          locationUpdatedByUserId: req.body.lat ? req.user!.userId : undefined,
          locationUpdatedAt: req.body.lat ? new Date() : undefined,
        },
      });
      await writeAuditLog({
        tenantId: req.tenantId!,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'SITE_CREATED',
        entityType: 'Site',
        entityId: site.id,
        metadata: { name: site.name },
      });
      res.status(201).json(site);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/sites:
 *   get:
 *     tags: [Sites]
 *     summary: List sites in the current tenant
 */
router.get(
  '/',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sites = await prisma.site.findMany({
        where: { tenantId: req.tenantId! },
        include: { _count: { select: { devices: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json(sites);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/sites/{siteId}:
 *   get:
 *     tags: [Sites]
 *     summary: Get site details
 */
router.get(
  '/:siteId',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const site = await prisma.site.findFirst({
        where: { id: req.params.siteId, tenantId: req.tenantId! },
        include: { devices: true },
      });
      if (!site) throw new NotFoundError('Site', req.params.siteId);
      res.json(site);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/sites/{siteId}/location:
 *   patch:
 *     tags: [Sites]
 *     summary: Update site location (map endpoint)
 */
router.patch(
  '/:siteId/location',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  validate(updateLocationSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const site = await prisma.site.findFirst({
        where: { id: req.params.siteId, tenantId: req.tenantId! },
      });
      if (!site) throw new NotFoundError('Site', req.params.siteId);

      // Check role-based access
      const membership = req.user!.memberships.find(m => m.tenantId === req.tenantId);
      const role = membership?.role;
      const isPlatformAdmin = req.user!.memberships.some(m => m.role === 'PLATFORM_ADMIN');

      if (!isPlatformAdmin && role === 'END_USER') {
        // END_USER can only update sites they own (have devices assigned to them)
        const hasAccess = await prisma.device.findFirst({
          where: { siteId: site.id, ownerUserId: req.user!.userId },
        });
        if (!hasAccess) throw new ForbiddenError('END_USER can only update sites they have access to');
      }

      const { lat, lon, accuracyM, addressLine1, city, postalCode, country, source, lock } = req.body;

      const updated = await prisma.site.update({
        where: { id: site.id },
        data: {
          lat,
          lon,
          locationSource: source,
          locationAccuracyM: accuracyM,
          locationUpdatedAt: new Date(),
          locationUpdatedByUserId: req.user!.userId,
          locationLock: lock !== undefined ? lock : site.locationLock,
          ...(addressLine1 && { addressLine1 }),
          ...(city && { city }),
          ...(postalCode && { postalCode }),
          ...(country && { country }),
        },
      });

      await writeAuditLog({
        tenantId: req.tenantId!,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'SITE_LOCATION_UPDATED',
        entityType: 'Site',
        entityId: site.id,
        metadata: { lat, lon, source, lock, previousLat: site.lat, previousLon: site.lon },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
