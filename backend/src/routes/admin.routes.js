import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import {
  provisionOpenNebulaUser,
  applyUserQuota,
} from "../integrations/opennebula/identity.service.js";
import { getInfrastructureCapacity } from "../integrations/opennebula/inventory.service.js";
import { recordAudit } from "../services/audit.service.js";

const router = Router();

router.get("/admin/users", requireAdmin, async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const where = status ? { accountStatus: status } : {};

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      accountStatus: true,
      emailVerifiedAt: true,
      opennebulaUserId: true,
      opennebulaUsername: true,
      quotaMaxVms: true,
      quotaMaxMemoryMb: true,
      quotaMaxCpu: true,
      quotaMaxDiskGb: true,
      rejectionReason: true,
      createdAt: true,
      activatedAt: true,
      _count: {
        select: {
          virtualMachines: { where: { status: { not: "TERMINATED" } } },
        },
      },
    },
  });

  return res.json({ users });
});

router.post("/admin/users/:id/activate", requireAdmin, async (req, res) => {
  const targetUser = await prisma.user.findUnique({
    where: { id: req.params.id },
  });
  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }

  if (targetUser.accountStatus === "PENDING_EMAIL_VERIFICATION") {
    return res
      .status(400)
      .json({
        error: "Cannot activate an account whose email is not verified yet.",
      });
  }

  if (targetUser.accountStatus === "ACTIVE" && targetUser.opennebulaUserId) {
    return res.json({ message: "User is already active.", user: targetUser });
  }

  await prisma.user.update({
    where: { id: targetUser.id },
    data: { accountStatus: "PROVISIONING_OPENNEBULA_IDENTITY" },
  });

  try {
    const mapped = await provisionOpenNebulaUser(
      targetUser.username,
      targetUser.opennebulaUserId,
      targetUser.opennebulaUsername,
    );

    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        opennebulaUserId: mapped.opennebulaUserId,
        opennebulaUsername: mapped.opennebulaUsername,
      },
    });

    await applyUserQuota(mapped.opennebulaUserId, {
      maxVms: targetUser.quotaMaxVms,
      maxMemoryMb: targetUser.quotaMaxMemoryMb,
      maxCpu: targetUser.quotaMaxCpu,
      maxDiskGb: targetUser.quotaMaxDiskGb,
    });

    const updated = await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        accountStatus: "ACTIVE",
        activatedAt: new Date(),
        rejectionReason: null,
      },
    });

    await recordAudit({
      actorUserId: req.currentUser.id,
      targetType: "User",
      targetId: targetUser.id,
      action: "ADMIN_ACTIVATED_USER",
      metadata: mapped,
    });

    return res.json({
      message: `Activated ${updated.username} and mapped OpenNebula identity '${mapped.opennebulaUsername}' (ID ${mapped.opennebulaUserId}).`,
      user: updated,
    });
  } catch (err) {
    await prisma.user.update({
      where: { id: targetUser.id },
      data: { accountStatus: "PENDING_ADMIN_ACTIVATION" },
    });

    return res.status(502).json({
      error: `OpenNebula identity provisioning failed: ${err.message}. You can safely retry activation.`,
    });
  }
});

const quotaUpdateSchema = z.object({
  quotaMaxVms: z.number().int().min(1).max(20),
  quotaMaxMemoryMb: z.number().int().min(256).max(16384),
  quotaMaxCpu: z.number().min(0.5).max(16),
  quotaMaxDiskGb: z.number().int().min(1).max(200),
});

router.put("/admin/users/:id/quota", requireAdmin, async (req, res) => {
  const parsed = quotaUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: req.params.id },
  });
  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }

  const { quotaMaxVms, quotaMaxMemoryMb, quotaMaxCpu, quotaMaxDiskGb } =
    parsed.data;

  try {
    if (
      targetUser.opennebulaUserId !== null &&
      targetUser.opennebulaUserId !== 0
    ) {
      await applyUserQuota(targetUser.opennebulaUserId, {
        maxVms: quotaMaxVms,
        maxMemoryMb: quotaMaxMemoryMb,
        maxCpu: quotaMaxCpu,
        maxDiskGb: quotaMaxDiskGb,
      });
    }

    const updated = await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        quotaMaxVms,
        quotaMaxMemoryMb,
        quotaMaxCpu,
        quotaMaxDiskGb,
      },
    });

    await recordAudit({
      actorUserId: req.currentUser.id,
      targetType: "User",
      targetId: targetUser.id,
      action: "ADMIN_UPDATED_USER_QUOTA",
      metadata: { quotaMaxVms, quotaMaxMemoryMb, quotaMaxCpu, quotaMaxDiskGb },
    });

    return res.json({
      message: `Updated quota for @${updated.username} and synchronized with OpenNebula.`,
      user: updated,
    });
  } catch (err) {
    return res.status(502).json({
      error: `Failed to sync quota with OpenNebula: ${err.message}`,
    });
  }
});

router.post("/admin/users/:id/reject", requireAdmin, async (req, res) => {
  const targetUser = await prisma.user.findUnique({
    where: { id: req.params.id },
  });
  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }
  if (targetUser.role === "ADMIN") {
    return res
      .status(400)
      .json({ error: "Cannot reject an administrator account." });
  }

  const reason =
    String(req.body?.reason || "").trim() ||
    "Registration declined by administrator.";
  const updated = await prisma.user.update({
    where: { id: targetUser.id },
    data: {
      accountStatus: "REJECTED",
      rejectionReason: reason,
    },
  });

  await recordAudit({
    actorUserId: req.currentUser.id,
    targetType: "User",
    targetId: targetUser.id,
    action: "ADMIN_REJECTED_USER",
    metadata: { reason },
  });

  return res.json({ message: "User registration rejected.", user: updated });
});

router.post("/admin/users/:id/suspend", requireAdmin, async (req, res) => {
  const targetUser = await prisma.user.findUnique({
    where: { id: req.params.id },
  });
  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }
  if (targetUser.role === "ADMIN") {
    return res
      .status(400)
      .json({ error: "Cannot suspend an administrator account." });
  }

  const updated = await prisma.user.update({
    where: { id: targetUser.id },
    data: { accountStatus: "SUSPENDED" },
  });

  await recordAudit({
    actorUserId: req.currentUser.id,
    targetType: "User",
    targetId: targetUser.id,
    action: "ADMIN_SUSPENDED_USER",
  });

  return res.json({ message: "User suspended.", user: updated });
});

router.get("/admin/resources", requireAdmin, async (req, res) => {
  try {
    const capacity = await getInfrastructureCapacity();
    return res.json(capacity);
  } catch (err) {
    return res
      .status(502)
      .json({
        error: `Failed to query OpenNebula infrastructure: ${err.message}`,
      });
  }
});

router.get("/admin/provisioning-operations", requireAdmin, async (req, res) => {
  const [operations, lifecycleOperations] = await Promise.all([
    prisma.provisioningOperation.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: {
          select: { username: true, email: true, opennebulaUsername: true },
        },
        operatingSystem: { select: { name: true } },
        vmOffering: { select: { name: true } },
      },
    }),
    prisma.vmLifecycleOperation.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { username: true } },
        virtualMachine: { select: { name: true, opennebulaVmId: true } },
      },
    }),
  ]);

  return res.json({ operations, lifecycleOperations });
});

export default router;
