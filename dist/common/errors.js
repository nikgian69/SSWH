"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntitlementError = exports.ConflictError = exports.ValidationError = exports.UnauthorizedError = exports.ForbiddenError = exports.NotFoundError = exports.AppError = void 0;
class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
class NotFoundError extends AppError {
    constructor(entity, id) {
        super(404, 'NOT_FOUND', id ? `${entity} with id '${id}' not found` : `${entity} not found`);
    }
}
exports.NotFoundError = NotFoundError;
class ForbiddenError extends AppError {
    constructor(message = 'Access denied') {
        super(403, 'FORBIDDEN', message);
    }
}
exports.ForbiddenError = ForbiddenError;
class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(401, 'UNAUTHORIZED', message);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ValidationError extends AppError {
    constructor(message, details) {
        super(400, 'VALIDATION_ERROR', message, details);
    }
}
exports.ValidationError = ValidationError;
class ConflictError extends AppError {
    constructor(message) {
        super(409, 'CONFLICT', message);
    }
}
exports.ConflictError = ConflictError;
class EntitlementError extends AppError {
    constructor(feature) {
        super(403, 'FEATURE_DISABLED', `Feature '${feature}' is not enabled for this tenant/device. Contact your administrator.`);
    }
}
exports.EntitlementError = EntitlementError;
//# sourceMappingURL=errors.js.map