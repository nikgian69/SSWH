"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../../common/prisma");
const validation_1 = require("../../common/validation");
const audit_1 = require("../../common/audit");
const errors_1 = require("../../common/errors");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
const inviteUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1),
    role: zod_1.z.enum(['TENANT_ADMIN', 'INSTALLER', 'SUPPORT_AGENT', 'END_USER']),
    password: zod_1.z.string().min(8).optional(),
});
const updateRoleSchema = zod_1.z.object({
    role: zod_1.z.enum(['TENANT_ADMIN', 'INSTALLER', 'SUPPORT_AGENT', 'END_USER']),
});
/**
 * @openapi
 * /api/users/invite:
 *   post:
 *     tags: [Users]
 *     summary: Invite a user to the current tenant
 */
router.post('/invite', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(inviteUserSchema), async (req, res, next) => {
    try {
        const { email, name, role, password } = req.body;
        const tenantId = req.tenantId;
        let user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user) {
            const passwordHash = await bcryptjs_1.default.hash(password || 'changeme123', 12);
            user = await prisma_1.prisma.user.create({
                data: { email, name, passwordHash, status: password ? 'ACTIVE' : 'INVITED' },
            });
        }
        const existing = await prisma_1.prisma.membership.findUnique({
            where: { userId_tenantId: { userId: user.id, tenantId } },
        });
        if (existing)
            throw new errors_1.ConflictError('User already a member of this tenant');
        const membership = await prisma_1.prisma.membership.create({
            data: { userId: user.id, tenantId, role },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'USER_INVITED',
            entityType: 'Membership',
            entityId: membership.id,
            metadata: { email, role },
        });
        res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, membership });
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List users in the current tenant
 */
router.get('/', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN', 'SUPPORT_AGENT'), async (req, res, next) => {
    try {
        const tenantId = req.tenantId;
        const memberships = await prisma_1.prisma.membership.findMany({
            where: { tenantId },
            include: { user: { select: { id: true, email: true, name: true, status: true } } },
        });
        res.json(memberships);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/users/{userId}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Change a user's role in the current tenant
 */
router.patch('/:userId/role', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(updateRoleSchema), async (req, res, next) => {
    try {
        const tenantId = req.tenantId;
        const { userId } = req.params;
        const { role } = req.body;
        const membership = await prisma_1.prisma.membership.findUnique({
            where: { userId_tenantId: { userId, tenantId } },
        });
        if (!membership)
            throw new errors_1.NotFoundError('Membership');
        const updated = await prisma_1.prisma.membership.update({
            where: { id: membership.id },
            data: { role },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'ROLE_CHANGED',
            entityType: 'Membership',
            entityId: membership.id,
            metadata: { userId, oldRole: membership.role, newRole: role },
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 */
router.get('/me', middleware_1.authenticateUser, middleware_1.loadUserContext, async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { id: true, email: true, name: true, status: true, createdAt: true },
        });
        res.json({ ...user, memberships: req.user.memberships });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map