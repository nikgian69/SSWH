"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../common/prisma");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
/**
 * @openapi
 * /api/audit:
 *   get:
 *     tags: [Audit]
 *     summary: List audit logs for the current tenant
 */
router.get('/', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
    try {
        const entityType = req.query.entityType;
        const entityId = req.query.entityId;
        const action = req.query.action;
        const limit = req.query.limit || '50';
        const offset = req.query.offset || '0';
        const where = {};
        const isPlatformAdmin = req.user.memberships.some(m => m.role === 'PLATFORM_ADMIN');
        if (!isPlatformAdmin) {
            where.tenantId = req.tenantId;
        }
        else if (req.tenantId) {
            where.tenantId = req.tenantId;
        }
        if (entityType)
            where.entityType = entityType;
        if (entityId)
            where.entityId = entityId;
        if (action)
            where.action = action;
        const logs = await prisma_1.prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: Math.min(parseInt(limit), 200),
            skip: parseInt(offset),
        });
        res.json(logs);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map