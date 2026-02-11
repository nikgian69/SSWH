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
const createSiteSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    addressLine1: zod_1.z.string().optional(),
    addressLine2: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    region: zod_1.z.string().optional(),
    postalCode: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
    lat: zod_1.z.number().min(-90).max(90).optional(),
    lon: zod_1.z.number().min(-180).max(180).optional(),
    locationSource: zod_1.z.enum(['MOBILE_GPS', 'EDGE_GNSS', 'EDGE_CELL', 'MANUAL']).optional(),
    locationAccuracyM: zod_1.z.number().optional(),
    locationLock: zod_1.z.boolean().optional(),
});
const updateLocationSchema = zod_1.z.object({
    lat: zod_1.z.number().min(-90).max(90),
    lon: zod_1.z.number().min(-180).max(180),
    accuracyM: zod_1.z.number().optional(),
    addressLine1: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    postalCode: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
    source: zod_1.z.enum(['MOBILE_GPS', 'MANUAL']),
    lock: zod_1.z.boolean().optional(),
});
/**
 * @openapi
 * /api/sites:
 *   post:
 *     tags: [Sites]
 *     summary: Create a new site
 */
router.post('/', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN', 'INSTALLER'), (0, validation_1.validate)(createSiteSchema), async (req, res, next) => {
    try {
        const site = await prisma_1.prisma.site.create({
            data: {
                ...req.body,
                tenantId: req.tenantId,
                locationUpdatedByUserId: req.body.lat ? req.user.userId : undefined,
                locationUpdatedAt: req.body.lat ? new Date() : undefined,
            },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId: req.tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'SITE_CREATED',
            entityType: 'Site',
            entityId: site.id,
            metadata: { name: site.name },
        });
        res.status(201).json(site);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/sites:
 *   get:
 *     tags: [Sites]
 *     summary: List sites in the current tenant
 */
router.get('/', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const sites = await prisma_1.prisma.site.findMany({
            where: { tenantId: req.tenantId },
            include: { _count: { select: { devices: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(sites);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/sites/{siteId}:
 *   get:
 *     tags: [Sites]
 *     summary: Get site details
 */
router.get('/:siteId', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const site = await prisma_1.prisma.site.findFirst({
            where: { id: req.params.siteId, tenantId: req.tenantId },
            include: { devices: true },
        });
        if (!site)
            throw new errors_1.NotFoundError('Site', req.params.siteId);
        res.json(site);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/sites/{siteId}/location:
 *   patch:
 *     tags: [Sites]
 *     summary: Update site location (map endpoint)
 */
router.patch('/:siteId/location', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, validation_1.validate)(updateLocationSchema), async (req, res, next) => {
    try {
        const site = await prisma_1.prisma.site.findFirst({
            where: { id: req.params.siteId, tenantId: req.tenantId },
        });
        if (!site)
            throw new errors_1.NotFoundError('Site', req.params.siteId);
        // Check role-based access
        const membership = req.user.memberships.find(m => m.tenantId === req.tenantId);
        const role = membership?.role;
        const isPlatformAdmin = req.user.memberships.some(m => m.role === 'PLATFORM_ADMIN');
        if (!isPlatformAdmin && role === 'END_USER') {
            // END_USER can only update sites they own (have devices assigned to them)
            const hasAccess = await prisma_1.prisma.device.findFirst({
                where: { siteId: site.id, ownerUserId: req.user.userId },
            });
            if (!hasAccess)
                throw new errors_1.ForbiddenError('END_USER can only update sites they have access to');
        }
        const { lat, lon, accuracyM, addressLine1, city, postalCode, country, source, lock } = req.body;
        const updated = await prisma_1.prisma.site.update({
            where: { id: site.id },
            data: {
                lat,
                lon,
                locationSource: source,
                locationAccuracyM: accuracyM,
                locationUpdatedAt: new Date(),
                locationUpdatedByUserId: req.user.userId,
                locationLock: lock !== undefined ? lock : site.locationLock,
                ...(addressLine1 && { addressLine1 }),
                ...(city && { city }),
                ...(postalCode && { postalCode }),
                ...(country && { country }),
            },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId: req.tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'SITE_LOCATION_UPDATED',
            entityType: 'Site',
            entityId: site.id,
            metadata: { lat, lon, source, lock, previousLat: site.lat, previousLon: site.lon },
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map