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
export declare function writeAuditLog(entry: AuditEntry): Promise<void>;
//# sourceMappingURL=audit.d.ts.map