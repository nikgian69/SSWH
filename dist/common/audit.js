"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = writeAuditLog;
const prisma_1 = require("./prisma");
async function writeAuditLog(entry) {
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                tenantId: entry.tenantId || null,
                actorUserId: entry.actorUserId || null,
                actorType: entry.actorType || 'SYSTEM',
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId,
                metadata: (entry.metadata || {}),
            },
        });
    }
    catch (err) {
        console.error('Failed to write audit log:', err);
    }
}
//# sourceMappingURL=audit.js.map