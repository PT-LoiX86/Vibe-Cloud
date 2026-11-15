import { prisma } from "../config/prisma.js";

export async function recordAudit({
  actorUserId = null,
  targetType,
  targetId,
  action,
  metadata = null,
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        actorUserId,
        targetType,
        targetId: String(targetId),
        action,
        metadata,
      },
    });
  } catch (err) {
    console.error("Failed to write audit event:", err.message);
  }
}
