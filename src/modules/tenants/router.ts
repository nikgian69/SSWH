import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { NotFoundError } from '../../common/errors';
import { AuthenticatedRequest, authenticateUser, loadUserContext, requireRoles } from '../../common/middleware';

const router = Router();

const createTenantSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['MANUFACTURER', 'RETAILER', 'INSTALLER', 'PROPERTY_MANAGER']),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/**
 * @openapi
 * /api/tenants:
 *   post:
 *     tags: [Tenants]
 *     summary: Create a new tenant (PLATFORM_ADMIN only)
 */
router.post(
  '/',
  authenticateUser,
  loadUserContext,
  requireRoles('PLATFORM_ADMIN'),
  validate(createTenantSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenant = await prisma.tenant.create({ data: req.body });
      await writeAuditLog({
        tenantId: tenant.id,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'TENANT_CREATED',
        entityType: 'Tenant',
        entityId: tenant.id,
        metadata: { name: tenant.name, type: tenant.type },
      });
      res.status(201).json(tenant);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/tenants:
 *   get:
 *     tags: [Tenants]
 *     summary: List tenants (PLATFORM_ADMIN sees all, others see their own)
 */
router.get(
  '/',
  authenticateUser,
  loadUserContext,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const isPlatformAdmin = req.user!.memberships.some(m => m.role === 'PLATFORM_ADMIN');
      const tenants = isPlatformAdmin
        ? await prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } })
        : await prisma.tenant.findMany({
            where: { id: { in: req.user!.memberships.map(m => m.tenantId) } },
            orderBy: { createdAt: 'desc' },
          });
      res.json(tenants);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/tenants/{id}:
 *   get:
 *     tags: [Tenants]
 *     summary: Get tenant details
 */
router.get(
  '/:id',
  authenticateUser,
  loadUserContext,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
      if (!tenant) throw new NotFoundError('Tenant', req.params.id);
      res.json(tenant);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/tenants/{id}:
 *   patch:
 *     tags: [Tenants]
 *     summary: Update tenant
 */
router.patch(
  '/:id',
  authenticateUser,
  loadUserContext,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(updateTenantSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenant = await prisma.tenant.update({
        where: { id: req.params.id },
        data: req.body,
      });
      await writeAuditLog({
        tenantId: tenant.id,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'TENANT_UPDATED',
        entityType: 'Tenant',
        entityId: tenant.id,
        metadata: req.body,
      });
      res.json(tenant);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
