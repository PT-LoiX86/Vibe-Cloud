import { prisma } from "../config/prisma.js";
import {
  instantiateVmForUser,
  inspectVmState,
  resizeVmDisk,
  performVmAction,
  listAllVmsFromPool,
} from "../integrations/opennebula/provisioning.service.js";
import { recordAudit } from "../services/audit.service.js";

const PROVISION_TIMEOUT_MS = 5 * 60 * 1000;
const LIFECYCLE_TIMEOUT_MS = 3 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 15 * 1000;

const resizeTriggeredOps = new Set();
let isTickRunning = false;
let lastReconcileAt = 0;

function formatFullFailureMessage(err) {
  const parts = [err.message];
  if (err.rawDetails) {
    parts.push("--- Technical Details ---");
    parts.push(err.rawDetails);
  }
  if (err.stack) {
    parts.push("--- Stack Trace ---");
    parts.push(err.stack);
  }
  return parts.join("\n");
}

async function processProvisioningOperation(op) {
  if (op.status === "PENDING") {
    const claimed = await prisma.provisioningOperation.updateMany({
      where: { id: op.id, status: "PENDING" },
      data: { status: "SUBMITTING" },
    });
    if (claimed.count === 0) return;

    try {
      const opennebulaVmId = await instantiateVmForUser({
        opennebulaUsername: op.user.opennebulaUsername,
        templateId: op.opennebulaTemplateId,
        vmName: op.requestedName,
        vcpu: op.vcpu,
        cpuCapacity: op.cpuCapacity,
        memoryMb: op.memoryMb,
        sshPublicKey: op.sshPublicKey,
        portalPublicKey: op.portalPublicKey,
      });

      await prisma.provisioningOperation.update({
        where: { id: op.id },
        data: {
          opennebulaVmId,
          status: "PROVISIONING",
        },
      });
    } catch (err) {
      const fullFailureMessage = formatFullFailureMessage(err);
      await prisma.provisioningOperation.update({
        where: { id: op.id },
        data: {
          opennebulaVmId: err.allocatedVmId ?? null,
          status: "FAILED",
          failureCode: err.oneErrorCode
            ? `ONE_${err.oneErrorCode}`
            : "INSTANTIATION_FAILED",
          failureMessage: fullFailureMessage,
          completedAt: new Date(),
        },
      });

      await recordAudit({
        actorUserId: op.userId,
        targetType: "ProvisioningOperation",
        targetId: op.id,
        action: "VM_PROVISIONING_FAILED",
        metadata: { error: err.message, failureCode: err.oneErrorCode ?? null },
      });
    }
    return;
  }

  if (op.status === "PROVISIONING" && op.opennebulaVmId !== null) {
    try {
      const status = await inspectVmState(
        op.user.opennebulaUsername,
        op.opennebulaVmId,
      );

      if (status.outcome === "READY") {
        const targetDiskMb = Math.round(Number(op.rootDiskGb) * 1024);
        const baseDiskMb = Number(op.operatingSystem.baseDiskMb || 512);
        const needsResize =
          targetDiskMb > baseDiskMb &&
          status.currentDisk0Mb > 0 &&
          status.currentDisk0Mb < targetDiskMb;

        if (needsResize && !resizeTriggeredOps.has(op.id)) {
          try {
            resizeTriggeredOps.add(op.id);
            await resizeVmDisk(
              op.user.opennebulaUsername,
              op.opennebulaVmId,
              0,
              targetDiskMb,
            );
            return;
          } catch (resizeErr) {
            resizeTriggeredOps.delete(op.id);
            const fullFailureMessage = formatFullFailureMessage(resizeErr);
            await prisma.provisioningOperation.update({
              where: { id: op.id },
              data: {
                status: "FAILED",
                failureCode: resizeErr.oneErrorCode
                  ? `ONE_${resizeErr.oneErrorCode}`
                  : "DISK_RESIZE_FAILED",
                failureMessage: fullFailureMessage,
                completedAt: new Date(),
              },
            });

            await recordAudit({
              actorUserId: op.userId,
              targetType: "ProvisioningOperation",
              targetId: op.id,
              action: "VM_PROVISIONING_FAILED",
              metadata: {
                opennebulaVmId: op.opennebulaVmId,
                error: resizeErr.message,
              },
            });
            return;
          }
        }

        resizeTriggeredOps.delete(op.id);

        // Promote VM to virtual_machines and delete the completed provisioning status record
        await prisma.$transaction([
          prisma.virtualMachine.upsert({
            where: { opennebulaVmId: op.opennebulaVmId },
            update: {
              ipAddress: status.ipAddress,
              status: "ACTIVE",
              lcmState: status.lcmLabel || "RUNNING",
              lastSyncedAt: new Date(),
            },
            create: {
              userId: op.userId,
              opennebulaVmId: op.opennebulaVmId,
              name: op.requestedName,
              operatingSystemId: op.operatingSystemId,
              vmOfferingId: op.vmOfferingId,
              vcpu: op.vcpu,
              cpuCapacity: op.cpuCapacity,
              memoryMb: op.memoryMb,
              rootDiskGb: op.rootDiskGb,
              ipAddress: status.ipAddress,
              status: "ACTIVE",
              lcmState: status.lcmLabel || "RUNNING",
              portalPublicKey: op.portalPublicKey,
              encryptedPrivateKey: op.encryptedPrivateKey,
              keyIv: op.keyIv,
              keyAuthTag: op.keyAuthTag,
              keyFingerprint: op.keyFingerprint,
              lastSyncedAt: new Date(),
            },
          }),
          prisma.provisioningOperation.deleteMany({
            where: { id: op.id },
          }),
        ]);

        await recordAudit({
          actorUserId: op.userId,
          targetType: "VirtualMachine",
          targetId: String(op.opennebulaVmId),
          action: "VM_READY",
          metadata: {
            operationId: op.id,
            vmName: op.requestedName,
            ipAddress: status.ipAddress,
          },
        });
        return;
      }

      if (status.outcome === "FAILED") {
        resizeTriggeredOps.delete(op.id);
        await prisma.provisioningOperation.update({
          where: { id: op.id },
          data: {
            status: "FAILED",
            failureCode: status.failureCode || "DEPLOYMENT_FAILED",
            failureMessage:
              status.failureMessage ||
              "OpenNebula reported a VM deployment failure.",
            completedAt: new Date(),
          },
        });
        return;
      }

      if (Date.now() - op.createdAt.getTime() > PROVISION_TIMEOUT_MS) {
        resizeTriggeredOps.delete(op.id);
        await prisma.provisioningOperation.update({
          where: { id: op.id },
          data: {
            status: "FAILED",
            failureCode: "PROVISIONING_TIMEOUT",
            failureMessage: status.schedMessage
              ? `Timed out waiting for VM boot: ${status.schedMessage}`
              : "Timed out waiting for OpenNebula to finish booting the VM.",
            completedAt: new Date(),
          },
        });
      }
    } catch (err) {
      console.error(`Worker polling error for op ${op.id}:`, err.message);
    }
  }
}

async function processLifecycleOperation(op) {
  if (op.status === "PENDING") {
    const claimed = await prisma.vmLifecycleOperation.updateMany({
      where: { id: op.id, status: "PENDING" },
      data: { status: "SUBMITTING" },
    });
    if (claimed.count === 0) return;

    try {
      await performVmAction(
        op.user.opennebulaUsername,
        op.opennebulaVmId,
        op.action,
      );

      await prisma.vmLifecycleOperation.update({
        where: { id: op.id },
        data: { status: "IN_PROGRESS" },
      });
    } catch (err) {
      await prisma.vmLifecycleOperation.update({
        where: { id: op.id },
        data: {
          status: "FAILED",
          failureCode: err.oneErrorCode
            ? `ONE_${err.oneErrorCode}`
            : "LIFECYCLE_ACTION_FAILED",
          failureMessage: formatFullFailureMessage(err),
          completedAt: new Date(),
        },
      });

      await recordAudit({
        actorUserId: op.userId,
        targetType: "VmLifecycleOperation",
        targetId: op.id,
        action: `VM_${op.action}_FAILED`,
        metadata: { opennebulaVmId: op.opennebulaVmId, error: err.message },
      });
    }
    return;
  }

  if (op.status === "IN_PROGRESS") {
    try {
      const live = await inspectVmState(
        op.user.opennebulaUsername,
        op.opennebulaVmId,
      );

      // 1. TERMINATE: soft-delete VM, wipe private key, and delete all status records for this VM
      if (op.action === "TERMINATE") {
        if (live.state === 6 || live.failureCode === "VM_NOT_FOUND") {
          await prisma.$transaction([
            prisma.virtualMachine.update({
              where: { id: op.virtualMachineId },
              data: {
                status: "TERMINATED",
                lcmState: "DONE",
                ipAddress: null,
                terminatedAt: new Date(),
                encryptedPrivateKey: null,
                keyIv: null,
                keyAuthTag: null,
                lastSyncedAt: new Date(),
              },
            }),
            prisma.provisioningOperation.deleteMany({
              where: { opennebulaVmId: op.opennebulaVmId },
            }),
            prisma.vmLifecycleOperation.deleteMany({
              where: { virtualMachineId: op.virtualMachineId },
            }),
          ]);

          await recordAudit({
            actorUserId: op.userId,
            targetType: "VirtualMachine",
            targetId: String(op.opennebulaVmId),
            action: "VM_TERMINATED",
            metadata: { operationId: op.id },
          });
          return;
        }
      }

      // 2. STOP / FORCE_STOP: completes once OpenNebula reaches UNDEPLOYED (state 9)
      if (op.action === "STOP" || op.action === "FORCE_STOP") {
        if (live.state === 9 || live.state === 8 || live.state === 4) {
          await prisma.$transaction([
            prisma.vmLifecycleOperation.update({
              where: { id: op.id },
              data: { status: "COMPLETED", completedAt: new Date() },
            }),
            prisma.virtualMachine.update({
              where: { id: op.virtualMachineId },
              data: {
                status: live.dbStatus,
                lcmState: live.stateLabel,
                ipAddress: live.state === 9 ? null : live.ipAddress,
                lastSyncedAt: new Date(),
              },
            }),
          ]);

          await recordAudit({
            actorUserId: op.userId,
            targetType: "VirtualMachine",
            targetId: String(op.opennebulaVmId),
            action: `VM_${op.action}_COMPLETED`,
            metadata: { operationId: op.id },
          });
          return;
        }
      }

      // 3. START: completes once VM returns to ACTIVE (state 3) & RUNNING (lcmState 3)
      if (op.action === "START") {
        if (live.state === 3 && live.lcmState === 3) {
          await prisma.$transaction([
            prisma.vmLifecycleOperation.update({
              where: { id: op.id },
              data: { status: "COMPLETED", completedAt: new Date() },
            }),
            prisma.virtualMachine.update({
              where: { id: op.virtualMachineId },
              data: {
                status: "ACTIVE",
                lcmState: "RUNNING",
                ipAddress: live.ipAddress,
                lastSyncedAt: new Date(),
              },
            }),
          ]);

          await recordAudit({
            actorUserId: op.userId,
            targetType: "VirtualMachine",
            targetId: String(op.opennebulaVmId),
            action: "VM_STARTED",
            metadata: { operationId: op.id, ipAddress: live.ipAddress },
          });
          return;
        }
      }

      // 4. REBOOT / FORCE_REBOOT: allow 3s for hypervisor reset, then confirm ACTIVE/RUNNING
      if (op.action === "REBOOT" || op.action === "FORCE_REBOOT") {
        const elapsedMs = Date.now() - op.updatedAt.getTime();
        if (elapsedMs >= 3000 && live.state === 3 && live.lcmState === 3) {
          await prisma.$transaction([
            prisma.vmLifecycleOperation.update({
              where: { id: op.id },
              data: { status: "COMPLETED", completedAt: new Date() },
            }),
            prisma.virtualMachine.update({
              where: { id: op.virtualMachineId },
              data: {
                status: "ACTIVE",
                lcmState: "RUNNING",
                ipAddress: live.ipAddress,
                lastSyncedAt: new Date(),
              },
            }),
          ]);

          await recordAudit({
            actorUserId: op.userId,
            targetType: "VirtualMachine",
            targetId: String(op.opennebulaVmId),
            action: `VM_${op.action}_COMPLETED`,
            metadata: { operationId: op.id, ipAddress: live.ipAddress },
          });
          return;
        }
      }

      if (live.outcome === "FAILED" && op.action !== "TERMINATE") {
        await prisma.vmLifecycleOperation.update({
          where: { id: op.id },
          data: {
            status: "FAILED",
            failureCode: live.failureCode || "LIFECYCLE_FAILED",
            failureMessage:
              live.failureMessage ||
              `VM entered error state during ${op.action}.`,
            completedAt: new Date(),
          },
        });
        return;
      }

      if (Date.now() - op.createdAt.getTime() > LIFECYCLE_TIMEOUT_MS) {
        await prisma.vmLifecycleOperation.update({
          where: { id: op.id },
          data: {
            status: "FAILED",
            failureCode: "LIFECYCLE_TIMEOUT",
            failureMessage: `Timed out waiting for VM #${op.opennebulaVmId} to complete ${op.action}.`,
            completedAt: new Date(),
          },
        });
      }
    } catch (err) {
      console.error(`Lifecycle polling error for op ${op.id}:`, err.message);
    }
  }
}

async function reconcileExternalVmStates() {
  const dbVms = await prisma.virtualMachine.findMany({
    where: { status: { not: "TERMINATED" } },
    select: {
      id: true,
      opennebulaVmId: true,
      status: true,
      lcmState: true,
      ipAddress: true,
    },
  });
  if (dbVms.length === 0) return;

  const inFlightOps = await prisma.vmLifecycleOperation.findMany({
    where: { status: { in: ["PENDING", "SUBMITTING", "IN_PROGRESS"] } },
    select: { virtualMachineId: true },
  });
  const busyVmIds = new Set(inFlightOps.map((o) => o.virtualMachineId));

  const poolMap = await listAllVmsFromPool();

  for (const vm of dbVms) {
    if (busyVmIds.has(vm.id)) continue;

    const live = poolMap.get(vm.opennebulaVmId);
    if (!live || live.dbStatus === "TERMINATED") {
      await prisma.$transaction([
        prisma.virtualMachine.update({
          where: { id: vm.id },
          data: {
            status: "TERMINATED",
            lcmState: "DONE",
            ipAddress: null,
            terminatedAt: new Date(),
            encryptedPrivateKey: null,
            keyIv: null,
            keyAuthTag: null,
            lastSyncedAt: new Date(),
          },
        }),
        prisma.provisioningOperation.deleteMany({
          where: { opennebulaVmId: vm.opennebulaVmId },
        }),
        prisma.vmLifecycleOperation.deleteMany({
          where: { virtualMachineId: vm.id },
        }),
      ]);
      continue;
    }

    const nextLcm = live.state === 3 ? live.lcmLabel : live.stateLabel;
    const nextIp =
      live.dbStatus === "UNDEPLOYED" ? null : live.ipAddress || vm.ipAddress;

    if (
      vm.status !== live.dbStatus ||
      vm.lcmState !== nextLcm ||
      vm.ipAddress !== nextIp
    ) {
      await prisma.virtualMachine.update({
        where: { id: vm.id },
        data: {
          status: live.dbStatus,
          lcmState: nextLcm,
          ipAddress: nextIp,
          lastSyncedAt: new Date(),
        },
      });
    }
  }
}

export function startProvisioningWorker(intervalMs = 3000) {
  console.log(
    `Provisioning & lifecycle worker started (polling every ${intervalMs}ms).`,
  );
  setInterval(async () => {
    if (isTickRunning) return;
    isTickRunning = true;
    try {
      await prisma.provisioningOperation.updateMany({
        where: {
          status: "SUBMITTING",
          opennebulaVmId: null,
          updatedAt: { lt: new Date(Date.now() - 30_000) },
        },
        data: { status: "PENDING" },
      });

      await prisma.vmLifecycleOperation.updateMany({
        where: {
          status: "SUBMITTING",
          updatedAt: { lt: new Date(Date.now() - 30_000) },
        },
        data: { status: "PENDING" },
      });

      const activeProvisionOps = await prisma.provisioningOperation.findMany({
        where: { status: { in: ["PENDING", "PROVISIONING"] } },
        orderBy: { createdAt: "asc" },
        take: 10,
        include: {
          user: { select: { opennebulaUsername: true } },
          operatingSystem: { select: { baseDiskMb: true } },
        },
      });

      for (const op of activeProvisionOps) {
        await processProvisioningOperation(op);
      }

      const activeLifecycleOps = await prisma.vmLifecycleOperation.findMany({
        where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        orderBy: { createdAt: "asc" },
        take: 15,
        include: {
          user: { select: { opennebulaUsername: true } },
        },
      });

      for (const op of activeLifecycleOps) {
        await processLifecycleOperation(op);
      }

      if (Date.now() - lastReconcileAt >= RECONCILE_INTERVAL_MS) {
        lastReconcileAt = Date.now();
        await reconcileExternalVmStates();
      }
    } catch (err) {
      console.error("Background worker tick failed:", err.message);
    } finally {
      isTickRunning = false;
    }
  }, intervalMs);
}
