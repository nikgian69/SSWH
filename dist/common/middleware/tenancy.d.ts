import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
/**
 * Tenancy enforcement middleware.
 * Extracts tenantId from header, params, or query.
 * Validates that the user has membership in the tenant.
 * Platform admins can access any tenant.
 */
export declare function enforceTenancy(req: AuthenticatedRequest, _res: Response, next: NextFunction): void;
/**
 * Helper to get tenant filter for queries.
 * Returns { tenantId } for normal users, or {} for platform admins querying all.
 */
export declare function getTenantFilter(req: AuthenticatedRequest): {
    tenantId: string;
} | {};
//# sourceMappingURL=tenancy.d.ts.map