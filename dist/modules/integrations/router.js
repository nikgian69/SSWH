"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geocodingProvider = void 0;
exports.fetchWeatherForTenant = fetchWeatherForTenant;
exports.fetchWeatherForAllTenants = fetchWeatherForAllTenants;
const express_1 = require("express");
const prisma_1 = require("../../common/prisma");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
// Stub weather provider for MVP
class StubWeatherProvider {
    async fetchForecast(lat, lon) {
        return {
            tempHighC: 20 + Math.random() * 15,
            tempLowC: 5 + Math.random() * 10,
            condition: ['sunny', 'partly_cloudy', 'cloudy', 'rain'][Math.floor(Math.random() * 4)],
            solarIrradianceWm2: 200 + Math.random() * 600,
            precipitationMm: Math.random() * 10,
        };
    }
}
const weatherProvider = new StubWeatherProvider();
// Stub geocoding provider
class StubGeocodingProvider {
    async forward(_address) { return null; }
    async reverse(_lat, _lon) { return null; }
}
exports.geocodingProvider = new StubGeocodingProvider();
/**
 * @openapi
 * /api/integrations/weather/fetch:
 *   post:
 *     tags: [Integrations]
 *     summary: Manually trigger weather data fetch for tenant sites
 */
router.post('/weather/fetch', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
    try {
        const count = await fetchWeatherForTenant(req.tenantId);
        res.json({ message: `Weather data fetched for ${count} sites` });
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/integrations/weather/{siteId}:
 *   get:
 *     tags: [Integrations]
 *     summary: Get weather data for a site
 */
router.get('/weather/:siteId', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const from = req.query.from;
        const to = req.query.to;
        const limit = req.query.limit || '30';
        const where = { siteId: req.params.siteId, tenantId: req.tenantId };
        if (from)
            where.date = { ...where.date, gte: new Date(from) };
        if (to)
            where.date = { ...where.date, lte: new Date(to) };
        const data = await prisma_1.prisma.weatherData.findMany({
            where,
            orderBy: { date: 'desc' },
            take: Math.min(parseInt(limit), 365),
        });
        res.json(data);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
// ─── WEATHER FETCH JOB ──────────────────────────────────────────────────────
async function fetchWeatherForTenant(tenantId) {
    const sites = await prisma_1.prisma.site.findMany({
        where: { tenantId, lat: { not: null }, lon: { not: null } },
    });
    let count = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const site of sites) {
        if (site.lat === null || site.lon === null)
            continue;
        try {
            const forecast = await weatherProvider.fetchForecast(site.lat, site.lon);
            await prisma_1.prisma.weatherData.upsert({
                where: { siteId_date: { siteId: site.id, date: today } },
                create: {
                    tenantId,
                    siteId: site.id,
                    date: today,
                    summary: forecast,
                },
                update: { summary: forecast },
            });
            count++;
        }
        catch (err) {
            console.error(`Weather fetch failed for site ${site.id}:`, err);
        }
    }
    return count;
}
async function fetchWeatherForAllTenants() {
    const tenants = await prisma_1.prisma.tenant.findMany({ where: { status: 'ACTIVE' } });
    let total = 0;
    for (const tenant of tenants) {
        total += await fetchWeatherForTenant(tenant.id);
    }
    return total;
}
//# sourceMappingURL=router.js.map