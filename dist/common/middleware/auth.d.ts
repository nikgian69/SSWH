import { Request, Response, NextFunction } from 'express';
import { MembershipRole } from '@prisma/client';
export interface JwtPayload {
    userId: string;
    email: string;
}
export interface AuthenticatedRequest extends Request {
    user?: JwtPayload & {
        memberships: Array<{
            tenantId: string;
            role: MembershipRole;
        }>;
    };
    tenantId?: string;
    deviceId?: string;
    isDeviceAuth?: boolean;
    params: Record<string, string>;
    body: any;
    query: Record<string, string | string[]>;
}
export declare function authenticateUser(req: AuthenticatedRequest, _res: Response, next: NextFunction): void;
export declare function loadUserContext(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void>;
export declare function authenticateDevice(req: AuthenticatedRequest, _res: Response, next: NextFunction): void;
export declare function requireRoles(...roles: MembershipRole[]): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map