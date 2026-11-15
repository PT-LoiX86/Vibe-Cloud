import { callOne } from "./xmlrpc-client.js";
import { parseOneXml } from "./xml-parser.js";
import { env } from "../../config/env.js";

const VM_STATE_LABELS = {
  0: "INIT",
  1: "PENDING",
  2: "HOLD",
  3: "ACTIVE",
  4: "STOPPED",
  5: "SUSPENDED",
  6: "DONE",
  8: "POWEROFF",
  9: "UNDEPLOYED",
  10: "CLONING",
  11: "CLONING_FAILURE",
};

const LCM_STATE_LABELS = {
  0: "LCM_INIT",
  1: "PROLOG",
  2: "BOOT",
  3: "RUNNING",
  4: "MIGRATE",
  5: "SAVE_STOP",
  6: "SAVE_SUSPEND",
  7: "SAVE_MIGRATE",
  8: "PROLOG_MIGRATE",
  9: "PROLOG_RESUME",
  10: "EPILOG_STOP",
  11: "EPILOG",
  12: "SHUTDOWN",
  13: "PROLOG_MIGRATE_FAILURE",
  14: "PROLOG_FAILURE",
  15: "EPILOG_FAILURE",
  16: "BOOT_FAILURE",
  17: "BOOT_MIGRATE_FAILURE",
  18: "PROLOG_RESUME_FAILURE",
  19: "EPILOG_STOP_FAILURE",
  20: "BOOT_STOPPED_FAILURE",
  21: "BOOT_UNDEPLOY_FAILURE",
  22: "PROLOG_UNDEPLOY_FAILURE",
  23: "EPILOG_UNDEPLOY_FAILURE",
};

const TERMINAL_LCM_FAILURES = new Set([
  13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
]);

const ACTION_TO_ONE_COMMAND = {
  START: "resume",
  STOP: "undeploy",
  FORCE_STOP: "undeploy-hard",
  REBOOT: "reboot",
  FORCE_REBOOT: "reboot-hard",
  TERMINATE: "terminate-hard",
};

function escapeOneString(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .trim();
}

function firstNode(val) {
  return Array.isArray(val) ? val[0] : val;
}

function extractScalar(val) {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return extractScalar(val[0]);
  if (typeof val === "object") {
    if ("#text" in val) return extractScalar(val["#text"]);
    if ("_" in val) return extractScalar(val._);
    return null;
  }
  return val;
}

export function mapOneStateToDbStatus(state, lcmState) {
  if (state === 6) return "TERMINATED";
  if (state === 9 || state === 4) return "UNDEPLOYED";
  if (state === 8) return "POWEROFF";
  if (state === 5) return "SUSPENDED";
  if (state === 11 || TERMINAL_LCM_FAILURES.has(lcmState)) return "ERROR";
  return "ACTIVE";
}

function parseVmRecord(vm) {
  const vmId = Number(extractScalar(vm.ID));
  const state = Number(extractScalar(vm.STATE));
  const lcmState = Number(extractScalar(vm.LCM_STATE));
  const stateLabel = VM_STATE_LABELS[state] || `STATE_${state}`;
  const lcmLabel = LCM_STATE_LABELS[lcmState] || `LCM_${lcmState}`;

  const tpl = firstNode(vm.TEMPLATE) || {};
  const nics = tpl.NIC || [];
  const primaryNic = firstNode(nics) || {};
  const rawIp = extractScalar(primaryNic.IP);
  const ipAddress = rawIp ? String(rawIp) : null;

  const disks = tpl.DISK || [];
  const diskList = Array.isArray(disks) ? disks : [disks];
  const disk0 =
    diskList.find((d) => Number(extractScalar(d?.DISK_ID)) === 0) ||
    diskList[0] ||
    {};
  const rawDiskSize = extractScalar(disk0.SIZE);
  const currentDisk0Mb = rawDiskSize !== null ? Number(rawDiskSize) : 0;

  const userTpl = firstNode(vm.USER_TEMPLATE) || {};
  const rawError =
    extractScalar(userTpl.ERROR) || extractScalar(userTpl.SCHED_MESSAGE);
  const errorMsg = rawError ? String(rawError) : null;

  let outcome = "PROVISIONING";
  if (state === 3 && lcmState === 3) {
    outcome = "READY";
  } else if (
    state === 6 ||
    state === 11 ||
    TERMINAL_LCM_FAILURES.has(lcmState)
  ) {
    outcome = "FAILED";
  }

  return {
    opennebulaVmId: vmId,
    state,
    lcmState,
    stateLabel,
    lcmLabel,
    dbStatus: mapOneStateToDbStatus(state, lcmState),
    ipAddress,
    currentDisk0Mb,
    outcome,
    failureCode: outcome === "FAILED" ? lcmLabel : null,
    failureMessage:
      outcome === "FAILED"
        ? errorMsg || `Deployment failed in state ${stateLabel} (${lcmLabel}).`
        : null,
    schedMessage: errorMsg,
  };
}

export async function instantiateVmForUser({
  opennebulaUsername,
  templateId,
  vmName,
  vcpu,
  cpuCapacity,
  memoryMb,
  sshPublicKey,
  portalPublicKey,
}) {
  const safeName = escapeOneString(vmName);

  // Combine user key and portal-managed vault key on separate lines for authorized_keys
  const rawKeys = [sshPublicKey, portalPublicKey]
    .map((k) => String(k || "").trim())
    .filter(Boolean);
  const uniqueKeys = [...new Set(rawKeys)];
  const combinedKeys = uniqueKeys.map((k) => escapeOneString(k)).join("\\n");

  const extraTemplate = [
    `CPU = "${Number(cpuCapacity).toFixed(2)}"`,
    `VCPU = "${Number(vcpu)}"`,
    `MEMORY = "${Number(memoryMb)}"`,
    `CONTEXT = [ NETWORK = "YES", SSH_PUBLIC_KEY = "${combinedKeys}" ]`,
  ].join("\n");

  const vmId = await callOne(
    "one.template.instantiate",
    [Number(templateId), safeName, false, extraTemplate, false],
    opennebulaUsername,
  );

  return Number(vmId);
}

export async function resizeVmDisk(
  opennebulaUsername,
  opennebulaVmId,
  diskId,
  targetDiskMb,
) {
  await callOne(
    "one.vm.diskresize",
    [
      Number(opennebulaVmId),
      Number(diskId),
      String(Math.round(Number(targetDiskMb))),
    ],
    opennebulaUsername,
  );
}

export async function performVmAction(
  opennebulaUsername,
  opennebulaVmId,
  lifecycleAction,
) {
  const oneAction = ACTION_TO_ONE_COMMAND[lifecycleAction];
  if (!oneAction) {
    throw new Error(`Unsupported VM lifecycle action: ${lifecycleAction}`);
  }
  await callOne(
    "one.vm.action",
    [oneAction, Number(opennebulaVmId)],
    opennebulaUsername,
  );
}

export async function inspectVmState(opennebulaUsername, opennebulaVmId) {
  try {
    const vmXml = await callOne(
      "one.vm.info",
      [Number(opennebulaVmId)],
      opennebulaUsername,
    );
    const parsed = parseOneXml(vmXml);
    const vm = firstNode(parsed?.VM);

    if (!vm) {
      return {
        outcome: "FAILED",
        dbStatus: "TERMINATED",
        stateLabel: "DONE",
        lcmLabel: "VM_NOT_FOUND",
        failureCode: "VM_NOT_FOUND",
        failureMessage: "Virtual machine record was not found in OpenNebula.",
      };
    }

    return parseVmRecord(vm);
  } catch (err) {
    // OpenNebula error code 1024 = resource does not exist (purged/terminated)
    if (err.oneErrorCode === 1024) {
      return {
        outcome: "FAILED",
        dbStatus: "TERMINATED",
        stateLabel: "DONE",
        lcmLabel: "VM_NOT_FOUND",
        failureCode: "VM_NOT_FOUND",
        failureMessage: "Virtual machine no longer exists in OpenNebula.",
      };
    }
    throw err;
  }
}

export async function listAllVmsFromPool() {
  // filter=-2 (all VMs visible to portal_server), start=-1, end=-1, state=-2 (all states including DONE)
  const poolXml = await callOne(
    "one.vmpool.info",
    [-2, -1, -1, -2],
    env.oneServerUser,
  );
  const parsed = parseOneXml(poolXml);
  const vms = parsed?.VM_POOL?.VM || [];
  const vmList = Array.isArray(vms) ? vms : [vms];

  const map = new Map();
  for (const vm of vmList) {
    if (!vm) continue;
    const info = parseVmRecord(vm);
    if (!Number.isNaN(info.opennebulaVmId)) {
      map.set(info.opennebulaVmId, info);
    }
  }
  return map;
}
