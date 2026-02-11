import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../common/middleware';
declare const router: import("express-serve-static-core").Router;
/**
 * Check if a feature is enabled for a tenant/device.
 * Reusable helper for other modules.
 */
export declare function checkEntitlement(tenantId: string, key: string, deviceId?: string): Promise<boolean>;
/**
 * Middleware to check entitlement before proceeding.
 */
export declare function requireEntitlement(key: string): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => Promise<void>;
export default router;
//# sourceMappingURL=router.d.ts.map