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
// ─── FIRMWARE PACKAGES ──────────────────────────────────────────────────────
const createFirmwareSchema = zod_1.z.object({
    version: zod_1.z.string().min(1),
    fileUrl: zod_1.z.string().url(),
    checksum: zod_1.z.string().min(1),
    releaseNotes: zod_1.z.string().optional(),
});
router.post('/firmware', middleware_1.authenticateUser, middleware_1.loadUserContext, (0, middleware_1.requireRoles)('PLATFORM_ADMIN'), (0, validation_1.validate)(createFirmwareSchema), async (req, res, next) => {
    try {
        const firmware = await prisma_1.prisma.firmwarePackage.create({ data: req.body });
        await (0, audit_1.writeAuditLog)({
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'FIRMWARE_REGISTERED',
            entityType: 'FirmwarePackage',
            entityId: firmware.id,
            metadata: { version: firmware.version },
        });
        res.status(201).json(firmware);
    }
    catch (err) {
        next(err);
    }
});
router.get('/firmware', middleware_1.authenticateUser, middleware_1.loadUserContext, async (_req, res, next) => {
    try {
        const packages = await prisma_1.prisma.firmwarePackage.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(packages);
    }
    catch (err) {
        next(err);
    }
});
// ─── OTA JOBS ───────────────────────────────────────────────────────────────
const createOtaJobSchema = zod_1.z.object({
    targetType: zod_1.z.enum(['DEVICE', 'GROUP']),
    deviceId: zod_1.z.string().uuid().optional(),
    groupFilter: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    firmwarePackageId: zod_1.z.string().uuid(),
    scheduledAt: zod_1.z.string().datetime(),
});
router.post('/jobs', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), (0, validation_1.validate)(createOtaJobSchema), async (req, res, next) => {
    try {
        const { targetType, deviceId, groupFilter, firmwarePackageId, scheduledAt } = req.body;
        const firmware = await prisma_1.prisma.firmwarePackage.findUnique({ where: { id: firmwarePackageId } });
        if (!firmware)
            throw new errors_1.NotFoundError('FirmwarePackage', firmwarePackageId);
        const job = await prisma_1.prisma.otaJob.create({
            data: {
                tenantId: req.tenantId,
                targetType,
                deviceId: deviceId || null,
                groupFilter: groupFilter || null,
                firmwarePackageId,
                status: 'SCHEDULED',
                scheduledAt: new Date(scheduledAt),
                createdByUserId: req.user.userId,
            },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId: req.tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'OTA_JOB_SCHEDULED',
            entityType: 'OtaJob',
            entityId: job.id,
            metadata: { targetType, firmwareVersion: firmware.version },
        });
        res.status(201).json(job);
    }
    catch (err) {
        next(err);
    }
});
router.get('/jobs', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
    try {
        const jobs = await prisma_1.prisma.otaJob.findMany({
            where: { tenantId: req.tenantId },
            include: { firmwarePackage: { select: { version: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(jobs);
    }
    catch (err) {
        next(err);
    }
});
router.patch('/jobs/:id', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
    try {
        const job = await prisma_1.prisma.otaJob.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!job)
            throw new errors_1.NotFoundError('OtaJob', req.params.id);
        const { status } = req.body;
        const updated = await prisma_1.prisma.otaJob.update({
            where: { id: job.id },
            data: {
                status,
                ...(status === 'CANCELED' ? { finishedAt: new Date() } : {}),
                ...(status === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
            },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId: req.tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: `OTA_JOB_${status}`,
            entityType: 'OtaJob',
            entityId: job.id,
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// ─── DEVICE-SIDE OTA ENDPOINTS ──────────────────────────────────────────────
router.get('/devices/:id/ota/pending', middleware_1.authenticateDevice, async (req, res, next) => {
    try {
        if (req.deviceId !== req.params.id) {
            throw new errors_1.ForbiddenError('Device ID mismatch');
        }
        const device = await prisma_1.prisma.device.findUnique({ where: { id: req.params.id } });
        if (!device)
            throw new errors_1.NotFoundError('Device', req.params.id);
        const jobs = await prisma_1.prisma.otaJob.findMany({
            where: {
                tenantId: device.tenantId,
                status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
                OR: [
                    { targetType: 'DEVICE', deviceId: device.id },
                    { targetType: 'GROUP' },
                ],
            },
            include: { firmwarePackage: true },
            orderBy: { scheduledAt: 'asc' },
            take: 1,
        });
        res.json(jobs.length > 0 ? jobs[0] : null);
    }
    catch (err) {
        next(err);
    }
});
router.post('/devices/:id/ota/report', middleware_1.authenticateDevice, async (req, res, next) => {
    try {
        if (req.deviceId !== req.params.id) {
            throw new errors_1.ForbiddenError('Device ID mismatch');
        }
        const { jobId, status, progress, errorMsg } = req.body;
        const job = await prisma_1.prisma.otaJob.findUnique({ where: { id: jobId } });
        if (!job)
            throw new errors_1.NotFoundError('OtaJob', jobId);
        const updateData = { progress };
        if (status === 'SUCCESS' || status === 'FAILED') {
            updateData.status = status;
            updateData.finishedAt = new Date();
        }
        if (status === 'IN_PROGRESS' && job.status === 'SCHEDULED') {
            updateData.status = 'IN_PROGRESS';
            updateData.startedAt = new Date();
        }
        const updated = await prisma_1.prisma.otaJob.update({ where: { id: jobId }, data: updateData });
        if (status === 'SUCCESS') {
            const firmware = await prisma_1.prisma.firmwarePackage.findUnique({ where: { id: job.firmwarePackageId } });
            if (firmware) {
                await prisma_1.prisma.device.update({
                    where: { id: req.params.id },
                    data: { firmwareVersion: firmware.version },
                });
            }
        }
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map