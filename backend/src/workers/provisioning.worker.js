import { prisma } from "../config/prisma.js";
import {
  instantiateVmForUser,
  inspectVmState,
  resizeVmDisk,
} from "../integrations/opennebula/provisioning.service.js";
import { recordAudit } from "../services/audit.service.js";

const PROVISION_TIMEOUT_MS = 5 * 60 * 1000;
const resizeTriggeredOps = new Set();
let isTickRunning = false;

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

async function processOperation(op) {
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

        // Dispatch one.vm.diskresize at most once per operation, then promote on the next tick
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

        await prisma.$transaction([
          prisma.provisioningOperation.update({
            where: { id: op.id },
            data: {
              status: "READY",
              completedAt: new Date(),
            },
          }),
          prisma.virtualMachine.upsert({
            where: { opennebulaVmId: op.opennebulaVmId },
            update: {
              ipAddress: status.ipAddress,
              lastSyncedAt: new Date(),
            },
            create: {
              userId: op.userId,
              opennebulaVmId: op.opennebulaVmId,
              name: op.requestedName,
              operatingSystemId: op.operatingSystemId,
              vmOfferingId: op.vmOfferingId,
              vcpu: op.vcpu,
              memoryMb: op.memoryMb,
              rootDiskGb: op.rootDiskGb,
              ipAddress: status.ipAddress,
              lastSyncedAt: new Date(),
            },
          }),
        ]);

        await recordAudit({
          actorUserId: op.userId,
          targetType: "VirtualMachine",
          targetId: String(op.opennebulaVmId),
          action: "VM_READY",
          metadata: { operationId: op.id, ipAddress: status.ipAddress },
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

        await recordAudit({
          actorUserId: op.userId,
          targetType: "ProvisioningOperation",
          targetId: op.id,
          action: "VM_PROVISIONING_FAILED",
          metadata: {
            opennebulaVmId: op.opennebulaVmId,
            reason: status.failureMessage,
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

export function startProvisioningWorker(intervalMs = 3000) {
  console.log(
    `Provisioning background worker started (polling every ${intervalMs}ms).`,
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

      const activeOps = await prisma.provisioningOperation.findMany({
        where: { status: { in: ["PENDING", "PROVISIONING"] } },
        orderBy: { createdAt: "asc" },
        take: 10,
        include: {
          user: { select: { opennebulaUsername: true } },
          operatingSystem: { select: { baseDiskMb: true } },
        },
      });

      for (const op of activeOps) {
        await processOperation(op);
      }
    } catch (err) {
      console.error("Provisioning worker tick failed:", err.message);
    } finally {
      isTickRunning = false;
    }
  }, intervalMs);
}
