import { Router, Response, NextFunction } from 'express';
import { prisma } from '../../common/prisma';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

/**
 * @openapi
 * /api/audit:
 *   get:
 *     tags: [Audit]
 *     summary: List audit logs for the current tenant
 */
router.get(
  '/',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const entityType = req.query.entityType as string | undefined;
      const entityId = req.query.entityId as string | undefined;
      const action = req.query.action as string | undefined;
      const limit = (req.query.limit as string) || '50';
      const offset = (req.query.offset as string) || '0';
      const where: any = {};

      const isPlatformAdmin = req.user!.memberships.some(m => m.role === 'PLATFORM_ADMIN');
      if (!isPlatformAdmin) {
        where.tenantId = req.tenantId;
      } else if (req.tenantId) {
        where.tenantId = req.tenantId;
      }

      if (entityType) where.entityType = entityType;
      if (entityId) where.entityId = entityId;
      if (action) where.action = action;

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit), 200),
        skip: parseInt(offset),
      });

      res.json(logs);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
