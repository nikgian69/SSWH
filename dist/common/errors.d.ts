export declare class AppError extends Error {
    statusCode: number;
    code: string;
    details?: unknown | undefined;
    constructor(statusCode: number, code: string, message: string, details?: unknown | undefined);
}
export declare class NotFoundError extends AppError {
    constructor(entity: string, id?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ValidationError extends AppError {
    constructor(message: string, details?: unknown);
}
export declare class ConflictError extends AppError {
    constructor(message: string);
}
export declare class EntitlementError extends AppError {
    constructor(feature: string);
}
//# sourceMappingURL=errors.d.ts.map