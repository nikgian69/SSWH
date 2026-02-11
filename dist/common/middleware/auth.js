"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateUser = authenticateUser;
exports.loadUserContext = loadUserContext;
exports.authenticateDevice = authenticateDevice;
exports.requireRoles = requireRoles;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const errors_1 = require("../errors");
const prisma_1 = require("../prisma");
function authenticateUser(req, _res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new errors_1.UnauthorizedError('Missing or invalid Authorization header');
        }
        const token = authHeader.substring(7);
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        req._jwtPayload = decoded;
        // Memberships will be loaded in tenancy middleware
        next();
    }
    catch (err) {
        if (err instanceof errors_1.UnauthorizedError)
            return next(err);
        next(new errors_1.UnauthorizedError('Invalid or expired token'));
    }
}
async function loadUserContext(req, _res, next) {
    try {
        const payload = req._jwtPayload;
        if (!payload)
            return next(new errors_1.UnauthorizedError());
        const memberships = await prisma_1.prisma.membership.findMany({
            where: { userId: payload.userId },
            select: { tenantId: true, role: true },
        });
        req.user = { ...payload, memberships };
        next();
    }
    catch (err) {
        next(err);
    }
}
function authenticateDevice(req, _res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new errors_1.UnauthorizedError('Missing device authorization');
        }
        const token = authHeader.substring(7);
        // Token format: deviceId:hmac
        const parts = token.split(':');
        if (parts.length !== 2)
            throw new errors_1.UnauthorizedError('Invalid device token format');
        const [deviceId, hmac] = parts;
        const expectedHmac = crypto_1.default
            .createHmac('sha256', config_1.config.deviceHmacSecret)
            .update(deviceId)
            .digest('hex');
        if (!crypto_1.default.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
            throw new errors_1.UnauthorizedError('Invalid device credentials');
        }
        req.deviceId = deviceId;
        req.isDeviceAuth = true;
        next();
    }
    catch (err) {
        if (err instanceof errors_1.UnauthorizedError)
            return next(err);
        next(new errors_1.UnauthorizedError('Invalid device credentials'));
    }
}
function requireRoles(...roles) {
    return (req, _res, next) => {
        if (!req.user)
            return next(new errors_1.UnauthorizedError());
        const tenantId = req.tenantId || req.params.tenantId || req.headers['x-tenant-id'];
        // Platform admin can do anything
        const isPlatformAdmin = req.user.memberships.some(m => m.role === 'PLATFORM_ADMIN');
        if (isPlatformAdmin)
            return next();
        if (!tenantId)
            return next(new errors_1.ForbiddenError('Tenant context required'));
        const membership = req.user.memberships.find(m => m.tenantId === tenantId);
        if (!membership)
            return next(new errors_1.ForbiddenError('Not a member of this tenant'));
        if (!roles.includes(membership.role)) {
            return next(new errors_1.ForbiddenError(`Requires one of: ${roles.join(', ')}`));
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map