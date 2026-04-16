import { prisma } from "@/lib/prisma"

export async function writeAuditLog({
  userId,
  action,
  entity,
  entityId,
  changes,
  ipAddress,
}: {
  userId?: string
  action: string
  entity: string
  entityId: string
  changes?: Record<string, unknown>
  ipAddress?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entity,
        entityId,
        changes: changes ? JSON.stringify(changes) : null,
        ipAddress: ipAddress || null,
      },
    })
  } catch {
    // Audit log failure should never break main operation
  }
}
