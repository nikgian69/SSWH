"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../common/prisma");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
/**
 * @openapi
 * /api/map/devices:
 *   get:
 *     tags: [Map]
 *     summary: Get device markers for map viewport (bbox query)
 *     parameters:
 *       - name: bbox
 *         in: query
 *         required: true
 *         schema: { type: string }
 *         description: "minLon,minLat,maxLon,maxLat"
 *       - name: zoom
 *         in: query
 *         schema: { type: number }
 */
router.get('/devices', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const bbox = req.query.bbox;
        const queryTenantId = req.query.tenantId;
        if (!bbox) {
            return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'bbox parameter is required (minLon,minLat,maxLon,maxLat)' } });
        }
        const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
        if ([minLon, minLat, maxLon, maxLat].some(isNaN)) {
            return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid bbox format' } });
        }
        // Determine tenant filter
        const isPlatformAdmin = req.user.memberships.some(m => m.role === 'PLATFORM_ADMIN');
        let tenantFilter = {};
        if (isPlatformAdmin && queryTenantId) {
            tenantFilter = { tenantId: queryTenantId };
        }
        else if (isPlatformAdmin) {
            // No filter — see all
        }
        else {
            tenantFilter = { tenantId: req.tenantId };
        }
        // Query devices with coordinates (from device or site)
        const devices = await prisma_1.prisma.device.findMany({
            where: {
                ...tenantFilter,
                OR: [
                    {
                        deviceLat: { gte: minLat, lte: maxLat },
                        deviceLon: { gte: minLon, lte: maxLon },
                    },
                    {
                        site: {
                            lat: { gte: minLat, lte: maxLat },
                            lon: { gte: minLon, lte: maxLon },
                        },
                    },
                ],
            },
            select: {
                id: true,
                siteId: true,
                status: true,
                lastSeenAt: true,
                deviceLat: true,
                deviceLon: true,
                deviceLocationSource: true,
                deviceLocationAccuracyM: true,
                site: {
                    select: {
                        lat: true,
                        lon: true,
                        locationSource: true,
                        locationAccuracyM: true,
                    },
                },
                _count: {
                    select: {
                        alertEvents: { where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } },
                    },
                },
            },
        });
        const markers = devices.map(d => {
            // Prefer device location, fall back to site location
            const lat = d.deviceLat ?? d.site?.lat;
            const lon = d.deviceLon ?? d.site?.lon;
            const locationSource = d.deviceLat ? d.deviceLocationSource : d.site?.locationSource;
            const accuracyM = d.deviceLat ? d.deviceLocationAccuracyM : d.site?.locationAccuracyM;
            return {
                deviceId: d.id,
                siteId: d.siteId,
                lat,
                lon,
                status: d.status,
                lastSeenAt: d.lastSeenAt,
                activeAlertsCount: d._count.alertEvents,
                locationSource,
                accuracyM,
            };
        }).filter(m => m.lat !== null && m.lon !== null);
        res.json(markers);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/map/devices/clusters:
 *   get:
 *     tags: [Map]
 *     summary: Get clustered device markers for low zoom levels
 */
router.get('/devices/clusters', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const bbox = req.query.bbox;
        const zoom = req.query.zoom || '5';
        if (!bbox) {
            return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'bbox parameter is required' } });
        }
        const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
        const zoomLevel = parseInt(zoom);
        // Grid-based clustering
        const gridSize = 360 / Math.pow(2, zoomLevel); // degrees per grid cell
        const sites = await prisma_1.prisma.site.findMany({
            where: {
                tenantId: req.tenantId,
                lat: { gte: minLat, lte: maxLat },
                lon: { gte: minLon, lte: maxLon },
            },
            include: { _count: { select: { devices: true } } },
        });
        // Group into grid cells
        const clusters = new Map();
        for (const site of sites) {
            if (site.lat === null || site.lon === null)
                continue;
            const cellX = Math.floor(site.lon / gridSize);
            const cellY = Math.floor(site.lat / gridSize);
            const key = `${cellX}:${cellY}`;
            if (!clusters.has(key)) {
                clusters.set(key, { lat: 0, lon: 0, count: 0, sites: [] });
            }
            const cluster = clusters.get(key);
            cluster.lat = (cluster.lat * cluster.count + site.lat) / (cluster.count + 1);
            cluster.lon = (cluster.lon * cluster.count + site.lon) / (cluster.count + 1);
            cluster.count += site._count.devices;
            cluster.sites.push(site.id);
        }
        res.json(Array.from(clusters.values()));
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=map.router.js.map