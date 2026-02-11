import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from '../errors';
import { prisma } from '../prisma';
import { MembershipRole } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload & {
    memberships: Array<{ tenantId: string; role: MembershipRole }>;
  };
  tenantId?: string;
  deviceId?: string;
  isDeviceAuth?: boolean;
  params: Record<string, string>;
  body: any;
  query: Record<string, string | string[]>;
}

export function authenticateUser(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    (req as any)._jwtPayload = decoded;
    // Memberships will be loaded in tenancy middleware
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export async function loadUserContext(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const payload = (req as any)._jwtPayload as JwtPayload;
    if (!payload) return next(new UnauthorizedError());

    const memberships = await prisma.membership.findMany({
      where: { userId: payload.userId },
      select: { tenantId: true, role: true },
    });

    req.user = { ...payload, memberships };
    next();
  } catch (err) {
    next(err);
  }
}

export function authenticateDevice(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing device authorization');
    }
    const token = authHeader.substring(7);
    // Token format: deviceId:hmac
    const parts = token.split(':');
    if (parts.length !== 2) throw new UnauthorizedError('Invalid device token format');

    const [deviceId, hmac] = parts;
    const expectedHmac = crypto
      .createHmac('sha256', config.deviceHmacSecret)
      .update(deviceId)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
      throw new UnauthorizedError('Invalid device credentials');
    }

    req.deviceId = deviceId;
    req.isDeviceAuth = true;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    next(new UnauthorizedError('Invalid device credentials'));
  }
}

export function requireRoles(...roles: MembershipRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());

    const tenantId = req.tenantId || req.params.tenantId || req.headers['x-tenant-id'] as string;

    // Platform admin can do anything
    const isPlatformAdmin = req.user.memberships.some(m => m.role === 'PLATFORM_ADMIN');
    if (isPlatformAdmin) return next();

    if (!tenantId) return next(new ForbiddenError('Tenant context required'));

    const membership = req.user.memberships.find(m => m.tenantId === tenantId);
    if (!membership) return next(new ForbiddenError('Not a member of this tenant'));

    if (!roles.includes(membership.role)) {
      return next(new ForbiddenError(`Requires one of: ${roles.join(', ')}`));
    }

    next();
  };
}
