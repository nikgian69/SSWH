"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../common/prisma");
const validation_1 = require("../../common/validation");
const audit_1 = require("../../common/audit");
const errors_1 = require("../../common/errors");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
const createTenantSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    type: zod_1.z.enum(['MANUFACTURER', 'RETAILER', 'INSTALLER', 'PROPERTY_MANAGER']),
});
const updateTenantSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    status: zod_1.z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
    settings: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * @openapi
 * /api/tenants:
 *   post:
 *     tags: [Tenants]
 *     summary: Create a new tenant (PLATFORM_ADMIN only)
 */
router.post('/', middleware_1.authenticateUser, middleware_1.loadUserContext, (0, middleware_1.requireRoles)('PLATFORM_ADMIN'), (0, validation_1.validate)(createTenantSchema), async (req, res, next) => {
    try {
        const tenant = await prisma_1.prisma.tenant.create({ data: req.body });
        await (0, audit_1.writeAuditLog)({
            tenantId: tenant.id,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'TENANT_CREATED',
            entityType: 'Tenant',
            entityId: tenant.id,
            metadata: { name: tenant.name, type: tenant.type },
        });
        res.status(201).json(tenant);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/tenants:
 *   get:
 *     tags: [Tenants]
 *     summary: List tenants (PLATFORM_ADMIN sees all, others see their own)
 */
router.get('/', middleware_1.authenticateUser, middleware_1.loadUserContext, async (req, res, next) => {
    try {
        const isPlatformAdmin = req.user.memberships.some(m => m.role === 'PLATFORM_ADMIN');
        const tenants = isPlatformAdmin
            ? await prisma_1.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } })
            : await prisma_1.prisma.tenant.findMany({
                where: { id: { in: req.user.memberships.map(m => m.tenantId) } },
                orderBy: { createdAt: 'desc' },
            });
        res.json(tenants);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/tenants/{id}:
 *   get:
 *     tags: [Tenants]
 *     summary: Get tenant details
 */
router.get('/:id', middleware_1.authenticateUser, middleware_1.loadUserContext, async (req, res, next) => {
    try {
        const tenant = await prisma_1.prisma.tenant.findUnique({ where: { id: req.params.id } });
        if (!tenant)
            throw new errors_1.NotFoundError('Tenant', req.params.id);
        res.json(tenant);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/tenants/{id}:
 *   patch:
 *     tags: [Tenants]
 *     summary: Update tenant
 */
router.patch('/:id', middleware_1.authenticateUser, middleware_1.loadUserContext, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(updateTenantSchema), async (req, res, next) => {
    try {
        const tenant = await prisma_1.prisma.tenant.update({
            where: { id: req.params.id },
            data: req.body,
        });
        await (0, audit_1.writeAuditLog)({
            tenantId: tenant.id,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'TENANT_UPDATED',
            entityType: 'Tenant',
            entityId: tenant.id,
            metadata: req.body,
        });
        res.json(tenant);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map