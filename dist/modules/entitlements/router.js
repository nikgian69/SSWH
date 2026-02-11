"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkEntitlement = checkEntitlement;
exports.requireEntitlement = requireEntitlement;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../common/prisma");
const validation_1 = require("../../common/validation");
const audit_1 = require("../../common/audit");
const errors_1 = require("../../common/errors");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
const upsertEntitlementSchema = zod_1.z.object({
    scope: zod_1.z.enum(['TENANT', 'DEVICE']),
    deviceId: zod_1.z.string().uuid().nullable().optional(),
    key: zod_1.z.enum(['BASIC_REMOTE_BOOST', 'SMART_HOME_INTEGRATION']),
    enabled: zod_1.z.boolean(),
});
/**
 * Check if a feature is enabled for a tenant/device.
 * Reusable helper for other modules.
 */
async function checkEntitlement(tenantId, key, deviceId) {
    // Check device-level first
    if (deviceId) {
        const deviceEntitlement = await prisma_1.prisma.entitlement.findFirst({
            where: { tenantId, key: key, deviceId, scope: 'DEVICE' },
        });
        if (deviceEntitlement)
            return deviceEntitlement.enabled;
    }
    // Check tenant-level
    const tenantEntitlement = await prisma_1.prisma.entitlement.findFirst({
        where: { tenantId, key: key, scope: 'TENANT', deviceId: null },
    });
    // BASIC_REMOTE_BOOST is enabled by default
    if (!tenantEntitlement && key === 'BASIC_REMOTE_BOOST')
        return true;
    return tenantEntitlement?.enabled ?? false;
}
/**
 * Middleware to check entitlement before proceeding.
 */
function requireEntitlement(key) {
    return async (req, _res, next) => {
        try {
            const tenantId = req.tenantId;
            if (!tenantId)
                return next();
            const deviceId = (req.params.id || req.params.deviceId);
            const enabled = await checkEntitlement(tenantId, key, deviceId);
            if (!enabled)
                throw new errors_1.EntitlementError(key);
            next();
        }
        catch (err) {
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
router.get('/', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
    try {
        const entitlements = await prisma_1.prisma.entitlement.findMany({
            where: { tenantId: req.tenantId },
            orderBy: { key: 'asc' },
        });
        res.json(entitlements);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/entitlements:
 *   put:
 *     tags: [Entitlements]
 *     summary: Create or update an entitlement
 */
router.put('/', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(upsertEntitlementSchema), async (req, res, next) => {
    try {
        const tenantId = req.tenantId;
        const { scope, deviceId, key, enabled } = req.body;
        const entitlement = await prisma_1.prisma.entitlement.upsert({
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
        await (0, audit_1.writeAuditLog)({
            tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'ENTITLEMENT_UPDATED',
            entityType: 'Entitlement',
            entityId: entitlement.id,
            metadata: { key, enabled, scope, deviceId },
        });
        res.json(entitlement);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map