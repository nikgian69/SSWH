"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../common/prisma");
const validation_1 = require("../../common/validation");
const audit_1 = require("../../common/audit");
const errors_1 = require("../../common/errors");
const router_1 = require("../entitlements/router");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
const createCommandSchema = zod_1.z.object({
    type: zod_1.z.enum(['REMOTE_BOOST_SET', 'SET_SCHEDULE', 'SET_CONFIG']),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
});
const ackCommandSchema = zod_1.z.object({
    status: zod_1.z.enum(['ACKED', 'FAILED']),
    errorMsg: zod_1.z.string().optional(),
});
router.post('/:id/commands', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN', 'INSTALLER', 'SUPPORT_AGENT', 'END_USER'), (0, router_1.requireEntitlement)('BASIC_REMOTE_BOOST'), (0, validation_1.validate)(createCommandSchema), async (req, res, next) => {
    try {
        const device = await prisma_1.prisma.device.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!device)
            throw new errors_1.NotFoundError('Device', req.params.id);
        const command = await prisma_1.prisma.command.create({
            data: {
                deviceId: device.id,
                type: req.body.type,
                payload: req.body.payload,
                status: 'QUEUED',
                requestedByUserId: req.user.userId,
                requestedAt: new Date(),
            },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId: req.tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'COMMAND_CREATED',
            entityType: 'Command',
            entityId: command.id,
            metadata: { type: command.type, deviceId: device.id },
        });
        res.status(201).json(command);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/commands', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const status = req.query.status;
        const device = await prisma_1.prisma.device.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!device)
            throw new errors_1.NotFoundError('Device', req.params.id);
        const where = { deviceId: device.id };
        if (status)
            where.status = status;
        const commands = await prisma_1.prisma.command.findMany({
            where,
            orderBy: { requestedAt: 'desc' },
            take: 50,
        });
        res.json(commands);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/commands/pending', middleware_1.authenticateDevice, async (req, res, next) => {
    try {
        if (req.deviceId !== req.params.id) {
            throw new errors_1.ForbiddenError('Device ID mismatch');
        }
        const commands = await prisma_1.prisma.command.findMany({
            where: { deviceId: req.params.id, status: 'QUEUED' },
            orderBy: { requestedAt: 'asc' },
        });
        if (commands.length > 0) {
            await prisma_1.prisma.command.updateMany({
                where: { id: { in: commands.map(c => c.id) } },
                data: { status: 'DELIVERED', deliveredAt: new Date() },
            });
        }
        res.json(commands);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/commands/:commandId/ack', middleware_1.authenticateDevice, (0, validation_1.validate)(ackCommandSchema), async (req, res, next) => {
    try {
        if (req.deviceId !== req.params.id) {
            throw new errors_1.ForbiddenError('Device ID mismatch');
        }
        const command = await prisma_1.prisma.command.findFirst({
            where: { id: req.params.commandId, deviceId: req.params.id },
        });
        if (!command)
            throw new errors_1.NotFoundError('Command', req.params.commandId);
        const updated = await prisma_1.prisma.command.update({
            where: { id: command.id },
            data: {
                status: req.body.status,
                ackAt: new Date(),
                errorMsg: req.body.errorMsg || null,
            },
        });
        const device = await prisma_1.prisma.device.findUnique({ where: { id: req.params.id } });
        await (0, audit_1.writeAuditLog)({
            tenantId: device?.tenantId,
            actorType: 'DEVICE',
            action: `COMMAND_${req.body.status}`,
            entityType: 'Command',
            entityId: command.id,
            metadata: { deviceId: req.params.id, status: req.body.status, errorMsg: req.body.errorMsg },
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map