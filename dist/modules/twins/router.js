"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../common/prisma");
const errors_1 = require("../../common/errors");
const middleware_1 = require("../../common/middleware");
const router = (0, express_1.Router)();
/**
 * @openapi
 * /api/devices/{id}/twin:
 *   get:
 *     tags: [DigitalTwins]
 *     summary: Get device digital twin state
 */
router.get('/:id/twin', middleware_1.authenticateUser, middleware_1.loadUserContext, middleware_1.enforceTenancy, async (req, res, next) => {
    try {
        const device = await prisma_1.prisma.device.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });
        if (!device)
            throw new errors_1.NotFoundError('Device', req.params.id);
        const twin = await prisma_1.prisma.deviceTwin.findUnique({ where: { deviceId: device.id } });
        if (!twin)
            throw new errors_1.NotFoundError('DeviceTwin');
        res.json(twin);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map