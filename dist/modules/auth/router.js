"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../../common/prisma");
const config_1 = require("../../common/config");
const errors_1 = require("../../common/errors");
const validation_1 = require("../../common/validation");
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    name: zod_1.z.string().min(1),
});
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and get JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: JWT token
 */
router.post('/login', (0, validation_1.validate)(loginSchema), async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user)
            throw new errors_1.UnauthorizedError('Invalid email or password');
        if (user.status !== 'ACTIVE')
            throw new errors_1.UnauthorizedError('Account is not active');
        const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!valid)
            throw new errors_1.UnauthorizedError('Invalid email or password');
        const memberships = await prisma_1.prisma.membership.findMany({
            where: { userId: user.id },
            select: { tenantId: true, role: true },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, config_1.config.jwtSecret, { expiresIn: config_1.config.jwtExpiresIn });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                memberships,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user (platform bootstrap)
 */
router.post('/register', (0, validation_1.validate)(registerSchema), async (req, res, next) => {
    try {
        const { email, password, name } = req.body;
        const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (existing)
            throw new errors_1.ValidationError('Email already registered');
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const user = await prisma_1.prisma.user.create({
            data: { email, passwordHash, name, status: 'ACTIVE' },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, config_1.config.jwtSecret, { expiresIn: config_1.config.jwtExpiresIn });
        res.status(201).json({
            token,
            user: { id: user.id, email: user.email, name: user.name },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map