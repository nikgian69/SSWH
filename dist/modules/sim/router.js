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
// Stub provider for MVP
class StubSimProvider {
    async activate(iccid) { return { success: true, providerRef: `stub-act-${iccid}` }; }
    async deactivate(iccid) { return { success: true, providerRef: `stub-deact-${iccid}` }; }
    async suspend(iccid) { return { success: true, providerRef: `stub-sus-${iccid}` }; }
    async resume(iccid) { return { success: true, providerRef: `stub-res-${iccid}` }; }
    async syncStatus(_iccid) { return { status: 'ACTIVE', dataUsageMb: Math.random() * 500 }; }
}
const simProvider = new StubSimProvider();
// ─── SIM INFO CRUD ──────────────────────────────────────────────────────────
const createSimSchema = zod_1.z.object({
    iccid: zod_1.z.string().min(1),
    carrier: zod_1.z.string().optional(),
    planName: zod_1.z.string().optional(),
    status: zod_1.z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'UNKNOWN']).optional(),
    msisdn: zod_1.z.string().optional(),
    imsi: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
/**
 * @openapi
 * /api/sim:
 *   post:
 *     tags: [SIM]
 *     summary: Register a SIM card
 */
router.post('/', middleware_1.authenticateUser, middleware_1.loadUserContext, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(createSimSchema), async (req, res, next) => {
    try {
        const sim = await prisma_1.prisma.simInfo.create({ data: req.body });
        res.status(201).json(sim);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/sim:
 *   get:
 *     tags: [SIM]
 *     summary: List all SIM cards
 */
router.get('/', middleware_1.authenticateUser, middleware_1.loadUserContext, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN', 'SUPPORT_AGENT'), async (_req, res, next) => {
    try {
        const sims = await prisma_1.prisma.simInfo.findMany({
            include: { devices: { select: { id: true, serialNumber: true, tenantId: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(sims);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/sim/{iccid}:
 *   get:
 *     tags: [SIM]
 *     summary: Get SIM details
 */
router.get('/:iccid', middleware_1.authenticateUser, middleware_1.loadUserContext, async (req, res, next) => {
    try {
        const sim = await prisma_1.prisma.simInfo.findUnique({
            where: { iccid: req.params.iccid },
            include: {
                devices: { select: { id: true, serialNumber: true, model: true, tenantId: true } },
                simActions: { orderBy: { requestedAt: 'desc' }, take: 10 },
            },
        });
        if (!sim)
            throw new errors_1.NotFoundError('SimInfo', req.params.iccid);
        res.json(sim);
    }
    catch (err) {
        next(err);
    }
});
// ─── SIM ACTIONS ────────────────────────────────────────────────────────────
const simActionSchema = zod_1.z.object({
    action: zod_1.z.enum(['ACTIVATE', 'DEACTIVATE', 'SUSPEND', 'RESUME']),
});
/**
 * @openapi
 * /api/sim/{iccid}/actions:
 *   post:
 *     tags: [SIM]
 *     summary: Request a SIM action (activate/deactivate/suspend/resume)
 */
router.post('/:iccid/actions', middleware_1.authenticateUser, middleware_1.loadUserContext, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(simActionSchema), async (req, res, next) => {
    try {
        const sim = await prisma_1.prisma.simInfo.findUnique({ where: { iccid: req.params.iccid } });
        if (!sim)
            throw new errors_1.NotFoundError('SimInfo', req.params.iccid);
        // Create action record
        const simAction = await prisma_1.prisma.simAction.create({
            data: {
                iccid: req.params.iccid,
                action: req.body.action,
                requestedByUserId: req.user.userId,
                status: 'REQUESTED',
            },
        });
        // Call provider adapter
        let result;
        switch (req.body.action) {
            case 'ACTIVATE':
                result = await simProvider.activate(req.params.iccid);
                break;
            case 'DEACTIVATE':
                result = await simProvider.deactivate(req.params.iccid);
                break;
            case 'SUSPEND':
                result = await simProvider.suspend(req.params.iccid);
                break;
            case 'RESUME':
                result = await simProvider.resume(req.params.iccid);
                break;
            default: result = { success: false, error: 'Unknown action' };
        }
        // Update action status
        const updatedAction = await prisma_1.prisma.simAction.update({
            where: { id: simAction.id },
            data: {
                status: result.success ? 'COMPLETED' : 'FAILED',
                providerRef: result.providerRef || null,
                errorMsg: result.error || null,
            },
        });
        // Update SIM status if successful
        if (result.success) {
            const statusMap = {
                ACTIVATE: 'ACTIVE',
                DEACTIVATE: 'INACTIVE',
                SUSPEND: 'SUSPENDED',
                RESUME: 'ACTIVE',
            };
            await prisma_1.prisma.simInfo.update({
                where: { iccid: req.params.iccid },
                data: { status: statusMap[req.body.action] },
            });
        }
        await (0, audit_1.writeAuditLog)({
            tenantId: req.tenantId || null,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: `SIM_${req.body.action}`,
            entityType: 'SimAction',
            entityId: simAction.id,
            metadata: { iccid: req.params.iccid, result: result.success ? 'COMPLETED' : 'FAILED' },
        });
        res.status(201).json(updatedAction);
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/integrations/sim/sync:
 *   post:
 *     tags: [SIM]
 *     summary: Sync SIM status from provider (manual trigger)
 */
router.post('/sync', middleware_1.authenticateUser, middleware_1.loadUserContext, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), async (_req, res, next) => {
    try {
        const sims = await prisma_1.prisma.simInfo.findMany();
        const results = [];
        for (const sim of sims) {
            try {
                const syncResult = await simProvider.syncStatus(sim.iccid);
                await prisma_1.prisma.simInfo.update({
                    where: { iccid: sim.iccid },
                    data: {
                        status: syncResult.status,
                        dataUsageMb: syncResult.dataUsageMb,
                        lastSyncAt: new Date(),
                    },
                });
                results.push({ iccid: sim.iccid, ...syncResult });
            }
            catch (err) {
                results.push({ iccid: sim.iccid, status: 'SYNC_FAILED' });
            }
        }
        res.json({ synced: results.length, results });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map