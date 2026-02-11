import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { NotFoundError, EntitlementError } from '../../common/errors';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

const upsertEntitlementSchema = z.object({
  scope: z.enum(['TENANT', 'DEVICE']),
  deviceId: z.string().uuid().nullable().optional(),
  key: z.enum(['BASIC_REMOTE_BOOST', 'SMART_HOME_INTEGRATION']),
  enabled: z.boolean(),
});

/**
 * Check if a feature is enabled for a tenant/device.
 * Reusable helper for other modules.
 */
export async function checkEntitlement(tenantId: string, key: string, deviceId?: string): Promise<boolean> {
  // Check device-level first
  if (deviceId) {
    const deviceEntitlement = await prisma.entitlement.findFirst({
      where: { tenantId, key: key as any, deviceId, scope: 'DEVICE' },
    });
    if (deviceEntitlement) return deviceEntitlement.enabled;
  }

  // Check tenant-level
  const tenantEntitlement = await prisma.entitlement.findFirst({
    where: { tenantId, key: key as any, scope: 'TENANT', deviceId: null },
  });

  // BASIC_REMOTE_BOOST is enabled by default
  if (!tenantEntitlement && key === 'BASIC_REMOTE_BOOST') return true;

  return tenantEntitlement?.enabled ?? false;
}

/**
 * Middleware to check entitlement before proceeding.
 */
export function requireEntitlement(key: string) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) return next();

      const deviceId = (req.params.id || req.params.deviceId) as string | undefined;
      const enabled = await checkEntitlement(tenantId, key, deviceId);
      if (!enabled) throw new EntitlementError(key);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * @openapi
 * /api/entitlements:
 *   get:
 *     tags: [Entitlements]
 *     summary: List entitlements for the current tenant
 */
router.get(
  '/',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const entitlements = await prisma.entitlement.findMany({
        where: { tenantId: req.tenantId! },
        orderBy: { key: 'asc' },
      });
      res.json(entitlements);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/entitlements:
 *   put:
 *     tags: [Entitlements]
 *     summary: Create or update an entitlement
 */
router.put(
  '/',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(upsertEntitlementSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const { scope, deviceId, key, enabled } = req.body;

      const entitlement = await prisma.entitlement.upsert({
        where: {
          tenantId_key_deviceId: {
            tenantId,
            key,
            deviceId: deviceId || null,
          },
        },
        create: { tenantId, scope, deviceId: deviceId || null, key, enabled },
        update: { enabled, scope },
      });

      await writeAuditLog({
        tenantId,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'ENTITLEMENT_UPDATED',
        entityType: 'Entitlement',
        entityId: entitlement.id,
        metadata: { key, enabled, scope, deviceId },
      });

      res.json(entitlement);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
