import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { ActorType } from '@prisma/client';

export interface AuditEntry {
  tenantId?: string | null;
  actorUserId?: string | null;
  actorType?: ActorType;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId || null,
        actorUserId: entry.actorUserId || null,
        actorType: entry.actorType || 'SYSTEM',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: (entry.metadata || {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
