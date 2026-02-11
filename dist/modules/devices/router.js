"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
const sync_1 = require("csv-parse/sync");
const multer_1 = __importDefault(require("multer"));
const prisma_1 = require("../../common/prisma");
const config_1 = require("../../common/config");
const validation_1 = require("../../common/validation");
const audit_1 = require("../../common/audit");
const errors_1 = require("../../common/errors");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const registerDeviceSchema = zod_1.z.object({
    serialNumber: zod_1.z.string().min(1),
    model: zod_1.z.string().min(1),
    firmwareVersion: zod_1.z.string().optional(),
    simIccid: zod_1.z.string().optional(),
    siteId: zod_1.z.string().uuid().optional(),
    ownerUserId: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().optional(),
});
const updateDeviceSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    tags: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    status: zod_1.z.enum(['PROVISIONED', 'INSTALLED', 'ACTIVE', 'SUSPENDED', 'RETIRED']).optional(),
    siteId: zod_1.z.string().uuid().nullable().optional(),
    ownerUserId: zod_1.z.string().uuid().nullable().optional(),
}).partial();
/**
 * @openapi
 * /api/devices:
 *   post:
 *     tags: [Devices]
 *     summary: Register a single device
 */
router.post('/', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN', 'INSTALLER'), (0, validation_1.validate)(registerDeviceSchema), async (req, res, next) => {
    try {
        const tenantId = req.tenantId;
        const { serialNumber, model, firmwareVersion, simIccid, siteId, ownerUserId, name } = req.body;
        // Check unique serial within tenant
        const existing = await prisma_1.prisma.device.findUnique({
            where: { tenantId_serialNumber: { tenantId, serialNumber } },
        });
        if (existing)
            throw new errors_1.ConflictError(`Device with serial '${serialNumber}' already exists in this tenant`);
        // Create device
        const device = await prisma_1.prisma.device.create({
            data: {
                tenantId,
                serialNumber,
                model,
                firmwareVersion,
                simIccid,
                siteId,
                ownerUserId,
                name,
                status: 'PROVISIONED',
            },
        });
        // Generate device secret
        const hmac = crypto_1.default.createHmac('sha256', config_1.config.deviceHmacSecret).update(device.id).digest('hex');
        await prisma_1.prisma.deviceSecret.create({
            data: {
                deviceId: device.id,
                secretHash: hmac,
            },
        });
        // Create device twin
        await prisma_1.prisma.deviceTwin.create({
            data: {
                deviceId: device.id,
                derivedState: { isOnline: false, healthScore: 0 },
            },
        });
        await (0, audit_1.writeAuditLog)({
            tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'DEVICE_REGISTERED',
            entityType: 'Device',
            entityId: device.id,
            metadata: { serialNumber, model },
        });
        // Return device with token for provisioning
        const deviceToken = `${device.id}:${hmac}`;
        res.status(201).json({ device, deviceToken });
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/devices/bulk:
 *   post:
 *     tags: [Devices]
 *     summary: Bulk register devices via CSV upload
 */
router.post('/bulk', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN'), upload.single('file'), async (req, res, next) => {
    try {
        const tenantId = req.tenantId;
        if (!req.file)
            throw new errors_1.ValidationError('CSV file is required');
        const records = (0, sync_1.parse)(req.file.buffer.toString(), {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
        const results = [];
        for (const record of records) {
            try {
                const existing = await prisma_1.prisma.device.findUnique({
                    where: { tenantId_serialNumber: { tenantId, serialNumber: record.serialNumber } },
                });
                if (existing) {
                    results.push({ serialNumber: record.serialNumber, status: 'SKIPPED', error: 'Already exists' });
                    continue;
                }
                const device = await prisma_1.prisma.device.create({
                    data: {
                        tenantId,
                        serialNumber: record.serialNumber,
                        model: record.model,
                        firmwareVersion: record.firmwareVersion || null,
                        simIccid: record.simIccid || null,
                        status: 'PROVISIONED',
                    },
                });
                const hmac = crypto_1.default.createHmac('sha256', config_1.config.deviceHmacSecret).update(device.id).digest('hex');
                await prisma_1.prisma.deviceSecret.create({ data: { deviceId: device.id, secretHash: hmac } });
                await prisma_1.prisma.deviceTwin.create({ data: { deviceId: device.id, derivedState: { isOnline: false } } });
                results.push({ serialNumber: record.serialNumber, status: 'CREATED', deviceId: device.id });
            }
            catch (err) {
                results.push({ serialNumber: record.serialNumber, status: 'FAILED', error: err.message });
            }
        }
        await (0, audit_1.writeAuditLog)({
            tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action: 'DEVICES_BULK_REGISTERED',
            entityType: 'Device',
            entityId: 'bulk',
            metadata: { count: records.length, created: results.filter(r => r.status === 'CREATED').length },
        });
        res.status(201).json({ total: records.length, results });
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/devices:
 *   get:
 *     tags: [Devices]
 *     summary: List/search devices
 */
router.get('/', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const siteId = req.query.siteId;
        const model = req.query.model;
        const status = req.query.status;
        const firmwareVersion = req.query.firmwareVersion;
        const search = req.query.search;
        const limit = req.query.limit || '50';
        const offset = req.query.offset || '0';
        const where = { tenantId: req.tenantId };
        if (siteId)
            where.siteId = siteId;
        if (model)
            where.model = model;
        if (status)
            where.status = status;
        if (firmwareVersion)
            where.firmwareVersion = firmwareVersion;
        if (search) {
            where.OR = [
                { serialNumber: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [devices, total] = await Promise.all([
            prisma_1.prisma.device.findMany({
                where,
                include: {
                    site: { select: { id: true, name: true } },
                    twin: { select: { derivedState: true, lastTs: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: Math.min(parseInt(limit), 200),
                skip: parseInt(offset),
            }),
            prisma_1.prisma.device.count({ where }),
        ]);
        res.json({ devices, total, limit: parseInt(limit), offset: parseInt(offset) });
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/devices/{id}:
 *   get:
 *     tags: [Devices]
 *     summary: Get device detail with twin and latest telemetry
 */
router.get('/:id', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const device = await prisma_1.prisma.device.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
            include: {
                site: true,
                twin: true,
                sim: true,
                entitlements: true,
            },
        });
        if (!device)
            throw new errors_1.NotFoundError('Device', req.params.id);
        // Get latest telemetry
        const latestTelemetry = await prisma_1.prisma.telemetry.findFirst({
            where: { deviceId: device.id },
            orderBy: { ts: 'desc' },
        });
        res.json({ ...device, latestTelemetry });
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/devices/{id}:
 *   patch:
 *     tags: [Devices]
 *     summary: Update device metadata, status, or assignment
 */
router.patch('/:id', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, (0, middleware_1.requireRoles)('PLATFORM_ADMIN', 'TENANT_ADMIN', 'INSTALLER'), (0, validation_1.validate)(updateDeviceSchema), async (req, res, next) => {
    try {
        const device = await prisma_1.prisma.device.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!device)
            throw new errors_1.NotFoundError('Device', req.params.id);
        const updated = await prisma_1.prisma.device.update({
            where: { id: device.id },
            data: req.body,
        });
        const action = req.body.siteId !== undefined ? 'DEVICE_REASSIGNED' :
            req.body.status ? 'DEVICE_STATUS_CHANGED' : 'DEVICE_UPDATED';
        await (0, audit_1.writeAuditLog)({
            tenantId: req.tenantId,
            actorUserId: req.user.userId,
            actorType: 'USER',
            action,
            entityType: 'Device',
            entityId: device.id,
            metadata: { changes: req.body, previous: { siteId: device.siteId, status: device.status } },
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map