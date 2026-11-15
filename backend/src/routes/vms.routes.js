import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { requireActiveUser } from "../middleware/auth.middleware.js";
import { generateEd25519Keypair } from "../services/ssh-keygen.service.js";
import {
  getUserQuotaAndUsage,
  getInfrastructureCapacity,
} from "../integrations/opennebula/inventory.service.js";
import { inspectVmState } from "../integrations/opennebula/provisioning.service.js";
import { recordAudit } from "../services/audit.service.js";

const router = Router();

// One-click Ed25519 key generator (private key is returned once and never stored)
router.post("/vms/generate-ssh-key", requireActiveUser, (req, res) => {
  const vmLabel =
    String(req.body?.vmName || "my-vm")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 32) || "my-vm";

  const { publicKey, privateKeyPem } = generateEd25519Keypair(
    `${req.currentUser.username}@iaas-portal`,
  );

  return res.json({
    publicKey,
    privateKeyPem,
    filename: `${vmLabel}-key.pem`,
  });
});

const createVmSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  mode: z.enum(["PRESET", "CUSTOM"]),
  name: z
    .string()
    .trim()
    .min(2, "VM name must be at least 2 characters")
    .max(40, "VM name must be at most 40 characters")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
      "VM name must start with a letter/number and contain only letters, numbers, dots, underscores, or hyphens",
    ),
  operatingSystemId: z.string().uuid(),
  vmOfferingId: z.string().uuid().optional().nullable(),
  customConfig: z
    .object({
      vcpu: z.number().int(),
      memoryMb: z.number().int(),
      rootDiskGb: z.number().int(),
    })
    .optional()
    .nullable(),
  sshPublicKey: z
    .string()
    .trim()
    .min(20, "SSH public key is required")
    .max(4096)
    .refine(
      (val) =>
        /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521)\s+[A-Za-z0-9+/=]+/.test(
          val,
        ),
      "Invalid SSH public key format. Paste a public key starting with ssh-ed25519 or ssh-rsa (never a private key).",
    ),
});

router.post("/vms", requireActiveUser, async (req, res) => {
  const parsed = createVmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const user = req.currentUser;
  if (!user.opennebulaUsername) {
    return res
      .status(400)
      .json({ error: "Account is missing an OpenNebula user mapping." });
  }

  const {
    idempotencyKey,
    mode,
    name,
    operatingSystemId,
    vmOfferingId,
    customConfig,
    sshPublicKey,
  } = parsed.data;

  // Idempotency check
  const existingOp = await prisma.provisioningOperation.findUnique({
    where: {
      userId_idempotencyKey: {
        userId: user.id,
        idempotencyKey,
      },
    },
  });

  if (existingOp) {
    return res.status(200).json({ operation: existingOp, deduplicated: true });
  }

  const os = await prisma.operatingSystem.findFirst({
    where: { id: operatingSystemId, active: true },
  });
  if (!os) {
    return res
      .status(400)
      .json({ error: "Selected operating system is unavailable." });
  }

  let vcpu;
  let cpuCapacity;
  let memoryMb;
  let rootDiskGb;
  let opennebulaTemplateId;
  let resolvedOfferingId = null;

  if (mode === "PRESET") {
    if (!vmOfferingId) {
      return res.status(400).json({ error: "Please select a VM plan." });
    }
    const offering = await prisma.vmOffering.findFirst({
      where: { id: vmOfferingId, active: true },
    });
    if (!offering) {
      return res
        .status(400)
        .json({ error: "Selected VM plan is unavailable." });
    }
    const mapping = await prisma.offeringTemplateMapping.findFirst({
      where: {
        operatingSystemId: os.id,
        vmOfferingId: offering.id,
        active: true,
      },
    });
    if (!mapping) {
      return res.status(400).json({
        error: "Selected OS and VM plan combination is not available.",
      });
    }

    vcpu = offering.vcpu;
    cpuCapacity = offering.cpuCapacity;
    memoryMb = offering.memoryMb;
    rootDiskGb = offering.rootDiskGb;
    opennebulaTemplateId = mapping.opennebulaTemplateId;
    resolvedOfferingId = offering.id;
  } else {
    if (!customConfig) {
      return res
        .status(400)
        .json({ error: "Custom resource configuration is required." });
    }
    const policy = await prisma.customProvisioningPolicy.findFirst({
      where: { operatingSystemId: os.id, active: true },
    });
    if (!policy) {
      return res
        .status(400)
        .json({ error: "Custom configuration is not enabled for this OS." });
    }

    const {
      vcpu: reqVcpu,
      memoryMb: reqMem,
      rootDiskGb: reqDisk,
    } = customConfig;
    if (
      reqVcpu < policy.minVcpu ||
      reqVcpu > policy.maxVcpu ||
      (reqVcpu - policy.minVcpu) % policy.stepVcpu !== 0 ||
      reqMem < policy.minMemoryMb ||
      reqMem > policy.maxMemoryMb ||
      (reqMem - policy.minMemoryMb) % policy.stepMemoryMb !== 0 ||
      reqDisk < policy.minDiskGb ||
      reqDisk > policy.maxDiskGb ||
      (reqDisk - policy.minDiskGb) % policy.stepDiskGb !== 0
    ) {
      return res.status(400).json({
        error:
          "Requested custom resources are outside administrator-approved limits.",
      });
    }

    vcpu = reqVcpu;
    cpuCapacity = Number((reqVcpu * 0.5).toFixed(2));
    memoryMb = reqMem;
    rootDiskGb = reqDisk;
    opennebulaTemplateId = policy.opennebulaTemplateId;
  }

  // Preflight quota & physical capacity check
  try {
    const [quotaInfo, infra] = await Promise.all([
      getUserQuotaAndUsage(user.opennebulaUsername),
      getInfrastructureCapacity(),
    ]);

    const uq = quotaInfo.userQuotas;
    const reqDiskMb = rootDiskGb * 1024;

    if (uq.vms.limit !== null && uq.vms.used + 1 > uq.vms.limit) {
      return res.status(400).json({
        code: "QUOTA_EXCEEDED",
        error: `VM count quota reached (${uq.vms.used}/${uq.vms.limit} VMs used).`,
      });
    }
    if (
      uq.memoryMb.limit !== null &&
      uq.memoryMb.used + memoryMb > uq.memoryMb.limit
    ) {
      return res.status(400).json({
        code: "QUOTA_EXCEEDED",
        error: `Memory quota exceeded (using ${uq.memoryMb.used} MB of ${uq.memoryMb.limit} MB allowance).`,
      });
    }
    if (uq.cpu.limit !== null && uq.cpu.used + cpuCapacity > uq.cpu.limit) {
      return res.status(400).json({
        code: "QUOTA_EXCEEDED",
        error: `CPU quota exceeded (using ${uq.cpu.used} of ${uq.cpu.limit} CPU units).`,
      });
    }
    if (
      uq.diskMb.limit !== null &&
      uq.diskMb.used + reqDiskMb > uq.diskMb.limit
    ) {
      return res.status(400).json({
        code: "QUOTA_EXCEEDED",
        error: `Storage quota exceeded (using ${Math.round(uq.diskMb.used / 1024)} GB of ${Math.round(uq.diskMb.limit / 1024)} GB).`,
      });
    }

    if (
      infra.summary.availableMemoryMb < memoryMb ||
      infra.summary.availableDiskMb < reqDiskMb
    ) {
      return res.status(409).json({
        code: "INSUFFICIENT_CAPACITY",
        error:
          "The physical lab server does not currently have enough free memory or disk space for this VM size.",
      });
    }
  } catch (err) {
    return res
      .status(502)
      .json({ error: `Preflight OpenNebula check failed: ${err.message}` });
  }

  const operation = await prisma.provisioningOperation.create({
    data: {
      userId: user.id,
      idempotencyKey,
      requestMode: mode,
      requestedName: name,
      operatingSystemId: os.id,
      vmOfferingId: resolvedOfferingId,
      vcpu,
      cpuCapacity,
      memoryMb,
      rootDiskGb,
      sshPublicKey,
      opennebulaTemplateId,
      status: "PENDING",
    },
    include: {
      operatingSystem: true,
      vmOffering: true,
    },
  });

  await recordAudit({
    actorUserId: user.id,
    targetType: "ProvisioningOperation",
    targetId: operation.id,
    action: "VM_PROVISIONING_REQUESTED",
    metadata: { mode, name, vcpu, memoryMb, rootDiskGb },
  });

  return res.status(202).json({ operation });
});

// Phase 1: My VMs shows successfully created/ready VMs only (read-only status & SSH info)
router.get("/vms", requireActiveUser, async (req, res) => {
  const user = req.currentUser;
  const vms = await prisma.virtualMachine.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      operatingSystem: true,
      vmOffering: true,
    },
  });

  // Sync live IP & runtime status from OpenNebula for display
  const enriched = await Promise.all(
    vms.map(async (vm) => {
      try {
        const live = await inspectVmState(
          user.opennebulaUsername,
          vm.opennebulaVmId,
        );
        if (live.ipAddress && live.ipAddress !== vm.ipAddress) {
          await prisma.virtualMachine.update({
            where: { id: vm.id },
            data: { ipAddress: live.ipAddress, lastSyncedAt: new Date() },
          });
        }
        return {
          ...vm,
          ipAddress: live.ipAddress || vm.ipAddress,
          runtimeState: live.stateLabel || "ACTIVE",
          lcmState: live.lcmLabel || "RUNNING",
        };
      } catch {
        return {
          ...vm,
          runtimeState: "UNKNOWN",
          lcmState: "UNREACHABLE",
        };
      }
    }),
  );

  return res.json({ virtualMachines: enriched });
});

router.get("/vms/:id", requireActiveUser, async (req, res) => {
  const vm = await prisma.virtualMachine.findFirst({
    where: { id: req.params.id, userId: req.currentUser.id },
    include: { operatingSystem: true, vmOffering: true },
  });
  if (!vm) {
    return res.status(404).json({ error: "Virtual machine not found." });
  }
  return res.json({ virtualMachine: vm });
});

router.get("/provisioning-operations", requireActiveUser, async (req, res) => {
  const operations = await prisma.provisioningOperation.findMany({
    where: { userId: req.currentUser.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      operatingSystem: {
        select: { name: true, slug: true, defaultSshUser: true },
      },
      vmOffering: { select: { name: true, slug: true } },
    },
  });

  return res.json({ operations });
});

router.get(
  "/provisioning-operations/:id",
  requireActiveUser,
  async (req, res) => {
    const operation = await prisma.provisioningOperation.findFirst({
      where: { id: req.params.id, userId: req.currentUser.id },
      include: {
        operatingSystem: true,
        vmOffering: true,
      },
    });
    if (!operation) {
      return res
        .status(404)
        .json({ error: "Provisioning operation not found." });
    }
    return res.json({ operation });
  },
);

export default router;
