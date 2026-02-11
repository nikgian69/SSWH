import { MembershipRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        memberships: Array<{ tenantId: string; role: MembershipRole }>;
      };
      tenantId?: string;
      deviceId?: string;
      isDeviceAuth?: boolean;
    }
  }
}

export {};
