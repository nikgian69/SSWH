"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processNotificationQueue = processNotificationQueue;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../common/prisma");
const validation_1 = require("../../common/validation");
const errors_1 = require("../../common/errors");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
const createChannelSchema = zod_1.z.object({
    type: zod_1.z.enum(['EMAIL', 'SMS', 'WEBHOOK']),
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    enabled: zod_1.z.boolean().optional(),
});
const updateChannelSchema = zod_1.z.object({
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    enabled: zod_1.z.boolean().optional(),
}).partial();
router.post('/channels', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(createChannelSchema), async (req, res, next) => {
    try {
        const channel = await prisma_1.prisma.notificationChannel.create({
            data: { ...req.body, tenantId: req.tenantId },
        });
        res.status(201).json(channel);
    }
    catch (err) {
        next(err);
    }
});
router.get('/channels', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
    try {
        const channels = await prisma_1.prisma.notificationChannel.findMany({
            where: { tenantId: req.tenantId },
        });
        res.json(channels);
    }
    catch (err) {
        next(err);
    }
});
router.patch('/channels/:id', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(updateChannelSchema), async (req, res, next) => {
    try {
        const channel = await prisma_1.prisma.notificationChannel.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!channel)
            throw new errors_1.NotFoundError('NotificationChannel', req.params.id);
        const updated = await prisma_1.prisma.notificationChannel.update({
            where: { id: channel.id },
            data: req.body,
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
router.get('/events', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
    try {
        const status = req.query.status;
        const limit = req.query.limit || '50';
        const where = { tenantId: req.tenantId };
        if (status)
            where.status = status;
        const events = await prisma_1.prisma.notificationEvent.findMany({
            where,
            include: {
                channel: { select: { type: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: Math.min(parseInt(limit), 200),
        });
        res.json(events);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
// ─── NOTIFICATION PROCESSING JOB ────────────────────────────────────────────
async function processNotificationQueue() {
    const queued = await prisma_1.prisma.notificationEvent.findMany({
        where: { status: 'QUEUED' },
        include: { channel: true },
        take: 100,
    });
    let processed = 0;
    for (const event of queued) {
        try {
            const channelConfig = event.channel.config;
            switch (event.channel.type) {
                case 'EMAIL':
                    console.log(`[EMAIL STUB] Sending to ${channelConfig.to || 'admin'}: Alert ${event.alertEventId}`);
                    break;
                case 'SMS':
                    console.log(`[SMS STUB] Sending to ${channelConfig.phone || 'admin'}: Alert ${event.alertEventId}`);
                    break;
                case 'WEBHOOK':
                    console.log(`[WEBHOOK STUB] POST to ${channelConfig.url || 'unknown'}: Alert ${event.alertEventId}`);
                    break;
            }
            await prisma_1.prisma.notificationEvent.update({
                where: { id: event.id },
                data: { status: 'SENT', sentAt: new Date() },
            });
            processed++;
        }
        catch (err) {
            await prisma_1.prisma.notificationEvent.update({
                where: { id: event.id },
                data: { status: 'FAILED', errorMsg: err.message },
            });
        }
    }
    return processed;
}
//# sourceMappingURL=router.js.map