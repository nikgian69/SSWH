"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceTenancy = enforceTenancy;
exports.getTenantFilter = getTenantFilter;
const errors_1 = require("../errors");
/**
 * Tenancy enforcement middleware.
 * Extracts tenantId from header, params, or query.
 * Validates that the user has membership in the tenant.
 * Platform admins can access any tenant.
 */
function enforceTenancy(req, _res, next) {
    try {
        // Skip for device-authenticated requests
        if (req.isDeviceAuth)
            return next();
        if (!req.user)
            return next(new errors_1.ForbiddenError('User context required'));
        const tenantId = req.params.tenantId ||
            req.headers['x-tenant-id'] ||
            (typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined);
        const isPlatformAdmin = req.user.memberships.some(m => m.role === 'PLATFORM_ADMIN');
        if (!tenantId && !isPlatformAdmin) {
            return next(new errors_1.ValidationError('x-tenant-id header or tenantId parameter is required'));
        }
        if (tenantId) {
            if (!isPlatformAdmin) {
                const membership = req.user.memberships.find(m => m.tenantId === tenantId);
                if (!membership) {
                    return next(new errors_1.ForbiddenError('Access denied: not a member of this tenant'));
                }
            }
            req.tenantId = tenantId;
        }
        next();
    }
    catch (err) {
        next(err);
    }
}
/**
 * Helper to get tenant filter for queries.
 * Returns { tenantId } for normal users, or {} for platform admins querying all.
 */
function getTenantFilter(req) {
    if (req.tenantId)
        return { tenantId: req.tenantId };
    const isPlatformAdmin = req.user?.memberships.some(m => m.role === 'PLATFORM_ADMIN');
    if (isPlatformAdmin)
        return {};
    throw new errors_1.ForbiddenError('Tenant context required');
}
//# sourceMappingURL=tenancy.js.map