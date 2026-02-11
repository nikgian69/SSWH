"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const errors_1 = require("../errors");
const zod_1 = require("zod");
function errorHandler(err, _req, res, _next) {
    if (err instanceof errors_1.AppError) {
        res.status(err.statusCode).json({
            error: {
                code: err.code,
                message: err.message,
                details: err.details || undefined,
            },
        });
        return;
    }
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: err.issues.map((e) => ({
                    path: e.path.join('.'),
                    message: e.message,
                })),
            },
        });
        return;
    }
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        },
    });
}
//# sourceMappingURL=errorHandler.js.map