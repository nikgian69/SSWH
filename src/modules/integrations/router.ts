import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

// ─── WEATHER PROVIDER INTERFACE ─────────────────────────────────────────────

interface WeatherProvider {
  fetchForecast(lat: number, lon: number): Promise<{
    tempHighC: number;
    tempLowC: number;
    condition: string;
    solarIrradianceWm2?: number;
    precipitationMm?: number;
  }>;
}

// Stub weather provider for MVP
class StubWeatherProvider implements WeatherProvider {
  async fetchForecast(lat: number, lon: number) {
    return {
      tempHighC: 20 + Math.random() * 15,
      tempLowC: 5 + Math.random() * 10,
      condition: ['sunny', 'partly_cloudy', 'cloudy', 'rain'][Math.floor(Math.random() * 4)],
      solarIrradianceWm2: 200 + Math.random() * 600,
      precipitationMm: Math.random() * 10,
    };
  }
}

const weatherProvider: WeatherProvider = new StubWeatherProvider();

// ─── GEOCODING PROVIDER INTERFACE ───────────────────────────────────────────

interface GeocodingProvider {
  forward(address: string): Promise<{ lat: number; lon: number } | null>;
  reverse(lat: number, lon: number): Promise<{ address: string; city?: string; country?: string } | null>;
}

// Stub geocoding provider
class StubGeocodingProvider implements GeocodingProvider {
  async forward(_address: string) { return null; }
  async reverse(_lat: number, _lon: number) { return null; }
}

export const geocodingProvider: GeocodingProvider = new StubGeocodingProvider();

/**
 * @openapi
 * /api/integrations/weather/fetch:
 *   post:
 *     tags: [Integrations]
 *     summary: Manually trigger weather data fetch for tenant sites
 */
router.post(
  '/weather/fetch',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const count = await fetchWeatherForTenant(req.tenantId!);
      res.json({ message: `Weather data fetched for ${count} sites` });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/integrations/weather/{siteId}:
 *   get:
 *     tags: [Integrations]
 *     summary: Get weather data for a site
 */
router.get(
  '/weather/:siteId',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const limit = (req.query.limit as string) || '30';
      const where: any = { siteId: req.params.siteId, tenantId: req.tenantId! };
      if (from) where.date = { ...where.date, gte: new Date(from) };
      if (to) where.date = { ...where.date, lte: new Date(to) };

      const data = await prisma.weatherData.findMany({
        where,
        orderBy: { date: 'desc' },
        take: Math.min(parseInt(limit), 365),
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

// ─── WEATHER FETCH JOB ──────────────────────────────────────────────────────

export async function fetchWeatherForTenant(tenantId: string): Promise<number> {
  const sites = await prisma.site.findMany({
    where: { tenantId, lat: { not: null }, lon: { not: null } },
  });

  let count = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const site of sites) {
    if (site.lat === null || site.lon === null) continue;
    try {
      const forecast = await weatherProvider.fetchForecast(site.lat, site.lon);
      await prisma.weatherData.upsert({
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
    } catch (err) {
      console.error(`Weather fetch failed for site ${site.id}:`, err);
    }
  }
  return count;
}

export async function fetchWeatherForAllTenants(): Promise<number> {
  const tenants = await prisma.tenant.findMany({ where: { status: 'ACTIVE' } });
  let total = 0;
  for (const tenant of tenants) {
    total += await fetchWeatherForTenant(tenant.id);
  }
  return total;
}
