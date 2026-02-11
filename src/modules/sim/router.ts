import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validation';
import { writeAuditLog } from '../../common/audit';
import { NotFoundError } from '../../common/errors';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  requireRoles,
} from '../../common/middleware';

const router = Router();

// ─── SIM PROVIDER ADAPTER INTERFACE ─────────────────────────────────────────

interface SimProviderAdapter {
  activate(iccid: string): Promise<{ success: boolean; providerRef?: string; error?: string }>;
  deactivate(iccid: string): Promise<{ success: boolean; providerRef?: string; error?: string }>;
  suspend(iccid: string): Promise<{ success: boolean; providerRef?: string; error?: string }>;
  resume(iccid: string): Promise<{ success: boolean; providerRef?: string; error?: string }>;
  syncStatus(iccid: string): Promise<{ status: string; dataUsageMb?: number }>;
}

// Stub provider for MVP
class StubSimProvider implements SimProviderAdapter {
  async activate(iccid: string) { return { success: true, providerRef: `stub-act-${iccid}` }; }
  async deactivate(iccid: string) { return { success: true, providerRef: `stub-deact-${iccid}` }; }
  async suspend(iccid: string) { return { success: true, providerRef: `stub-sus-${iccid}` }; }
  async resume(iccid: string) { return { success: true, providerRef: `stub-res-${iccid}` }; }
  async syncStatus(_iccid: string) { return { status: 'ACTIVE', dataUsageMb: Math.random() * 500 }; }
}

const simProvider: SimProviderAdapter = new StubSimProvider();

// ─── SIM INFO CRUD ──────────────────────────────────────────────────────────

const createSimSchema = z.object({
  iccid: z.string().min(1),
  carrier: z.string().optional(),
  planName: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'UNKNOWN']).optional(),
  msisdn: z.string().optional(),
  imsi: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * @openapi
 * /api/sim:
 *   post:
 *     tags: [SIM]
 *     summary: Register a SIM card
 */
router.post(
  '/',
  authenticateUser,
  loadUserContext,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(createSimSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sim = await prisma.simInfo.create({ data: req.body });
      res.status(201).json(sim);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/sim:
 *   get:
 *     tags: [SIM]
 *     summary: List all SIM cards
 */
router.get(
  '/',
  authenticateUser,
  loadUserContext,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN', 'SUPPORT_AGENT'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sims = await prisma.simInfo.findMany({
        include: { devices: { select: { id: true, serialNumber: true, tenantId: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json(sims);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/sim/{iccid}:
 *   get:
 *     tags: [SIM]
 *     summary: Get SIM details
 */
router.get(
  '/:iccid',
  authenticateUser,
  loadUserContext,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sim = await prisma.simInfo.findUnique({
        where: { iccid: req.params.iccid },
        include: {
          devices: { select: { id: true, serialNumber: true, model: true, tenantId: true } },
          simActions: { orderBy: { requestedAt: 'desc' }, take: 10 },
        },
      });
      if (!sim) throw new NotFoundError('SimInfo', req.params.iccid);
      res.json(sim);
    } catch (err) {
      next(err);
    }
  }
);

// ─── SIM ACTIONS ────────────────────────────────────────────────────────────

const simActionSchema = z.object({
  action: z.enum(['ACTIVATE', 'DEACTIVATE', 'SUSPEND', 'RESUME']),
});

/**
 * @openapi
 * /api/sim/{iccid}/actions:
 *   post:
 *     tags: [SIM]
 *     summary: Request a SIM action (activate/deactivate/suspend/resume)
 */
router.post(
  '/:iccid/actions',
  authenticateUser,
  loadUserContext,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  validate(simActionSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sim = await prisma.simInfo.findUnique({ where: { iccid: req.params.iccid } });
      if (!sim) throw new NotFoundError('SimInfo', req.params.iccid);

      // Create action record
      const simAction = await prisma.simAction.create({
        data: {
          iccid: req.params.iccid,
          action: req.body.action,
          requestedByUserId: req.user!.userId,
          status: 'REQUESTED',
        },
      });

      // Call provider adapter
      let result: { success: boolean; providerRef?: string; error?: string };
      switch (req.body.action) {
        case 'ACTIVATE': result = await simProvider.activate(req.params.iccid); break;
        case 'DEACTIVATE': result = await simProvider.deactivate(req.params.iccid); break;
        case 'SUSPEND': result = await simProvider.suspend(req.params.iccid); break;
        case 'RESUME': result = await simProvider.resume(req.params.iccid); break;
        default: result = { success: false, error: 'Unknown action' };
      }

      // Update action status
      const updatedAction = await prisma.simAction.update({
        where: { id: simAction.id },
        data: {
          status: result.success ? 'COMPLETED' : 'FAILED',
          providerRef: result.providerRef || null,
          errorMsg: result.error || null,
        },
      });

      // Update SIM status if successful
      if (result.success) {
        const statusMap: Record<string, any> = {
          ACTIVATE: 'ACTIVE',
          DEACTIVATE: 'INACTIVE',
          SUSPEND: 'SUSPENDED',
          RESUME: 'ACTIVE',
        };
        await prisma.simInfo.update({
          where: { iccid: req.params.iccid },
          data: { status: statusMap[req.body.action] },
        });
      }

      await writeAuditLog({
        tenantId: req.tenantId || null,
        actorUserId: req.user!.userId,
        actorType: 'USER',
        action: `SIM_${req.body.action}`,
        entityType: 'SimAction',
        entityId: simAction.id,
        metadata: { iccid: req.params.iccid, result: result.success ? 'COMPLETED' : 'FAILED' },
      });

      res.status(201).json(updatedAction);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/integrations/sim/sync:
 *   post:
 *     tags: [SIM]
 *     summary: Sync SIM status from provider (manual trigger)
 */
router.post(
  '/sync',
  authenticateUser,
  loadUserContext,
  requireRoles('PLATFORM_ADMIN', 'TENANT_ADMIN'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sims = await prisma.simInfo.findMany();
      const results: Array<{ iccid: string; status: string; dataUsageMb?: number }> = [];

      for (const sim of sims) {
        try {
          const syncResult = await simProvider.syncStatus(sim.iccid);
          await prisma.simInfo.update({
            where: { iccid: sim.iccid },
            data: {
              status: syncResult.status as any,
              dataUsageMb: syncResult.dataUsageMb,
              lastSyncAt: new Date(),
            },
          });
          results.push({ iccid: sim.iccid, ...syncResult });
        } catch (err: any) {
          results.push({ iccid: sim.iccid, status: 'SYNC_FAILED' });
        }
      }

      res.json({ synced: results.length, results });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
