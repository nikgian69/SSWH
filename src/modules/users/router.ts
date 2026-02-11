import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { NotFoundError, ConflictError, ForbiddenError } from '../../common/errors';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['TENANT_ADMIN', 'INSTALLER', 'SUPPORT_AGENT', 'END_USER']),
  password: z.string().min(8).optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['TENANT_ADMIN', 'INSTALLER', 'SUPPORT_AGENT', 'END_USER']),
});

/**
 * @openapi
 * /api/users/invite:
 *   post:
 *     tags: [Users]
 *     summary: Invite a user to the current tenant
 */
router.post(
  '/invite',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(inviteUserSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { email, name, role, password } = req.body;
      const tenantId = req.tenantId!;

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        const passwordHash = await bcrypt.hash(password || 'changeme123', 12);
        user = await prisma.user.create({
          data: { email, name, passwordHash, status: password ? 'ACTIVE' : 'INVITED' },
        });
      }

      const existing = await prisma.membership.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId } },
      });
      if (existing) throw new ConflictError('User already a member of this tenant');

      const membership = await prisma.membership.create({
        data: { userId: user.id, tenantId, role },
      });

      await writeAuditLog({
        tenantId,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'USER_INVITED',
        entityType: 'Membership',
        entityId: membership.id,
        metadata: { email, role },
      });

      res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, membership });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List users in the current tenant
 */
router.get(
  '/',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN', 'SUPPORT_AGENT'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const memberships = await prisma.membership.findMany({
        where: { tenantId },
        include: { user: { select: { id: true, email: true, name: true, status: true } } },
      });
      res.json(memberships);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/users/{userId}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Change a user's role in the current tenant
 */
router.patch(
  '/:userId/role',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(updateRoleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const { userId } = req.params;
      const { role } = req.body;

      const membership = await prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
      });
      if (!membership) throw new NotFoundError('Membership');

      const updated = await prisma.membership.update({
        where: { id: membership.id },
        data: { role },
      });

      await writeAuditLog({
        tenantId,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: 'ROLE_CHANGED',
        entityType: 'Membership',
        entityId: membership.id,
        metadata: { userId, oldRole: membership.role, newRole: role },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 */
router.get(
  '/me',
  authenticateUser,
  loadUserContext,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, email: true, name: true, status: true, createdAt: true },
      });
      res.json({ ...user, memberships: req.user!.memberships });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
