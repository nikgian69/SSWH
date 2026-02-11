import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { ForbiddenError, ValidationError } from '../errors';

/**
 * Tenancy enforcement middleware.
 * Extracts tenantId from header, params, or query.
 * Validates that the user has membership in the tenant.
 * Platform admins can access any tenant.
 */
export function enforceTenancy(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    // Skip for device-authenticated requests
    if (req.isDeviceAuth) return next();

    if (!req.user) return next(new ForbiddenError('User context required'));

    const tenantId: string | undefined =
      req.params.tenantId ||
      (req.headers['x-tenant-id'] as string | undefined) ||
      (typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined);

    const isPlatformAdmin = req.user.memberships.some(m => m.role === 'PLATFORM_ADMIN');

    if (!tenantId && !isPlatformAdmin) {
      return next(new ValidationError('x-tenant-id header or tenantId parameter is required'));
    }

    if (tenantId) {
      if (!isPlatformAdmin) {
        const membership = req.user.memberships.find(m => m.tenantId === tenantId);
        if (!membership) {
          return next(new ForbiddenError('Access denied: not a member of this tenant'));
        }
      }
      req.tenantId = tenantId;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Helper to get tenant filter for queries.
 * Returns { tenantId } for normal users, or {} for platform admins querying all.
 */
export function getTenantFilter(req: AuthenticatedRequest): { tenantId: string } | {} {
  if (req.tenantId) return { tenantId: req.tenantId };
  const isPlatformAdmin = req.user?.memberships.some(m => m.role === 'PLATFORM_ADMIN');
  if (isPlatformAdmin) return {};
  throw new ForbiddenError('Tenant context required');
}
