import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { requireActiveUser } from "../middleware/auth.middleware.js";
import { generateEd25519Keypair } from "../services/ssh-keygen.service.js";
import {
  encryptPrivateKey,
  computeSshKeyFingerprint,
} from "../services/vm-key-vault.service.js";
import {
  getUserQuotaAndUsage,
  getInfrastructureCapacity,
} from "../integrations/opennebula/inventory.service.js";
import { recordAudit } from "../services/audit.service.js";

const router = Router();

// One-click Ed25519 key generator for user's local terminal download
router.post("/vms/generate-ssh-key", requireActiveUser, (req, res) => {
  const vmLabel =
    String(req.body?.vmName || "my-vm")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 32) || "my-vm";

  const { publicKey, privateKeyPem } = generateEd25519Keypair(
    `${req.currentUser.username}@vibe-cloud`,
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

  // Dual-Layer Quota & Physical Capacity Preflight Check
  try {
    const [quotaInfo, infra, nonTerminatedVms, inFlightBuilds] =
      await Promise.all([
        getUserQuotaAndUsage(user.opennebulaUsername),
        getInfrastructureCapacity(),
        prisma.virtualMachine.findMany({
          where: { userId: user.id, status: { not: "TERMINATED" } },
          select: { memoryMb: true, cpuCapacity: true, rootDiskGb: true },
        }),
        prisma.provisioningOperation.findMany({
          where: {
            userId: user.id,
            status: { in: ["PENDING", "SUBMITTING", "PROVISIONING"] },
          },
          select: { memoryMb: true, cpuCapacity: true, rootDiskGb: true },
        }),
      ]);

    const uq = quotaInfo.userQuotas;
    const reqDiskMb = rootDiskGb * 1024;

    const dbUsedVms = nonTerminatedVms.length + inFlightBuilds.length;
    const dbUsedMem = [...nonTerminatedVms, ...inFlightBuilds].reduce(
      (s, v) => s + v.memoryMb,
      0,
    );
    const dbUsedCpu = [...nonTerminatedVms, ...inFlightBuilds].reduce(
      (s, v) => s + v.cpuCapacity,
      0,
    );
    const dbUsedDiskGb = [...nonTerminatedVms, ...inFlightBuilds].reduce(
      (s, v) => s + v.rootDiskGb,
      0,
    );

    const effectiveUsedVms = Math.max(uq.vms.used, dbUsedVms);
    const effectiveLimitVms = uq.vms.limit ?? user.quotaMaxVms;

    const effectiveUsedMem = Math.max(uq.memoryMb.used, dbUsedMem);
    const effectiveLimitMem = uq.memoryMb.limit ?? user.quotaMaxMemoryMb;

    const effectiveUsedCpu = Math.max(uq.cpu.used, dbUsedCpu);
    const effectiveLimitCpu = uq.cpu.limit ?? user.quotaMaxCpu;

    const effectiveUsedDiskMb = Math.max(uq.diskMb.used, dbUsedDiskGb * 1024);
    const effectiveLimitDiskMb = uq.diskMb.limit ?? user.quotaMaxDiskGb * 1024;

    if (
      effectiveLimitVms !== null &&
      effectiveUsedVms + 1 > effectiveLimitVms
    ) {
      return res.status(400).json({
        code: "QUOTA_EXCEEDED",
        error: `VM count quota reached (${effectiveUsedVms}/${effectiveLimitVms} VMs allocated, including stopped VMs).`,
      });
    }
    if (
      effectiveLimitMem !== null &&
      effectiveUsedMem + memoryMb > effectiveLimitMem
    ) {
      return res.status(400).json({
        code: "QUOTA_EXCEEDED",
        error: `Memory quota exceeded (${effectiveUsedMem} MB used of ${effectiveLimitMem} MB allowance).`,
      });
    }
    if (
      effectiveLimitCpu !== null &&
      effectiveUsedCpu + cpuCapacity > effectiveLimitCpu + 0.001
    ) {
      return res.status(400).json({
        code: "QUOTA_EXCEEDED",
        error: `CPU quota exceeded (${effectiveUsedCpu.toFixed(1)} used of ${effectiveLimitCpu} CPU units).`,
      });
    }
    if (
      effectiveLimitDiskMb !== null &&
      effectiveUsedDiskMb + reqDiskMb > effectiveLimitDiskMb
    ) {
      return res.status(400).json({
        code: "QUOTA_EXCEEDED",
        error: `Storage quota exceeded (${Math.round(effectiveUsedDiskMb / 1024)} GB used of ${Math.round(effectiveLimitDiskMb / 1024)} GB).`,
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

  // Generate an internal portal-managed Ed25519 keypair and encrypt it with AES-256-GCM
  // so 1-click browser SSH works even when the user supplies their own public key
  const managedKeypair = generateEd25519Keypair(
    `portal-vault-${user.username}@vibe-cloud`,
  );
  const encryptedVault = encryptPrivateKey(managedKeypair.privateKeyPem);
  const keyFingerprint = computeSshKeyFingerprint(managedKeypair.publicKey);

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
      portalPublicKey: managedKeypair.publicKey,
      encryptedPrivateKey: encryptedVault.encryptedPrivateKey,
      keyIv: encryptedVault.keyIv,
      keyAuthTag: encryptedVault.keyAuthTag,
      keyFingerprint,
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

router.get("/vms", requireActiveUser, async (req, res) => {
  const user = req.currentUser;
  const includeTerminated = req.query.includeTerminated === "true";

  const vms = await prisma.virtualMachine.findMany({
    where: {
      userId: user.id,
      ...(includeTerminated ? {} : { status: { not: "TERMINATED" } }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      opennebulaVmId: true,
      name: true,
      vcpu: true,
      cpuCapacity: true,
      memoryMb: true,
      rootDiskGb: true,
      ipAddress: true,
      status: true,
      lcmState: true,
      keyFingerprint: true,
      terminatedAt: true,
      lastSyncedAt: true,
      createdAt: true,
      operatingSystem: true,
      vmOffering: true,
      lifecycleOperations: {
        where: { status: { in: ["PENDING", "SUBMITTING", "IN_PROGRESS"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const formatted = vms.map(
    ({ lifecycleOperations, keyFingerprint, ...vm }) => ({
      ...vm,
      runtimeState: vm.status,
      hasManagedKey: Boolean(keyFingerprint),
      keyFingerprint,
      activeOperation: lifecycleOperations[0] || null,
    }),
  );

  return res.json({ virtualMachines: formatted });
});

const lifecycleActionSchema = z.object({
  action: z.enum([
    "START",
    "STOP",
    "FORCE_STOP",
    "REBOOT",
    "FORCE_REBOOT",
    "TERMINATE",
  ]),
});

router.post("/vms/:id/actions", requireActiveUser, async (req, res) => {
  const parsed = lifecycleActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const user = req.currentUser;
  const vm = await prisma.virtualMachine.findFirst({
    where: { id: req.params.id, userId: user.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "Virtual machine not found." });
  }

  if (vm.status === "TERMINATED") {
    return res
      .status(400)
      .json({ error: "Terminated virtual machines cannot be modified." });
  }

  const existingOp = await prisma.vmLifecycleOperation.findFirst({
    where: {
      virtualMachineId: vm.id,
      status: { in: ["PENDING", "SUBMITTING", "IN_PROGRESS"] },
    },
  });

  if (existingOp) {
    return res.status(409).json({
      error: `Another lifecycle operation (${existingOp.action}) is already in progress for this VM.`,
    });
  }

  const { action } = parsed.data;
  const stoppedStates = new Set(["UNDEPLOYED", "POWEROFF", "SUSPENDED"]);

  if (action === "START" && !stoppedStates.has(vm.status)) {
    return res
      .status(400)
      .json({ error: `Cannot start a VM that is currently ${vm.status}.` });
  }

  if (
    ["STOP", "FORCE_STOP", "REBOOT", "FORCE_REBOOT"].includes(action) &&
    vm.status !== "ACTIVE"
  ) {
    return res.status(400).json({
      error: `Cannot perform ${action} while VM is ${vm.status}.`,
    });
  }

  const operation = await prisma.vmLifecycleOperation.create({
    data: {
      userId: user.id,
      virtualMachineId: vm.id,
      opennebulaVmId: vm.opennebulaVmId,
      action,
      status: "PENDING",
    },
  });

  await recordAudit({
    actorUserId: user.id,
    targetType: "VirtualMachine",
    targetId: String(vm.opennebulaVmId),
    action: `VM_${action}_REQUESTED`,
    metadata: { operationId: operation.id, vmName: vm.name },
  });

  return res.status(202).json({ operation });
});

router.get("/lifecycle-operations", requireActiveUser, async (req, res) => {
  const operations = await prisma.vmLifecycleOperation.findMany({
    where: { userId: req.currentUser.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      virtualMachine: {
        select: { name: true, opennebulaVmId: true },
      },
    },
  });

  return res.json({ operations });
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
