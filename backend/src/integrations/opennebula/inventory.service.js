import { callOne } from "./xmlrpc-client.js";
import { parseOneXml } from "./xml-parser.js";
import { env } from "../../config/env.js";

function extractVmQuota(quotaBlock) {
  const vmEntry = Array.isArray(quotaBlock?.VM)
    ? quotaBlock.VM[0]
    : quotaBlock?.VM;
  if (!vmEntry) {
    return {
      vms: { used: 0, limit: null },
      memoryMb: { used: 0, limit: null },
      cpu: { used: 0, limit: null },
      diskMb: { used: 0, limit: null },
    };
  }

  const parseLimit = (val) =>
    val === undefined || val === null || Number(val) < 0 ? null : Number(val);

  return {
    vms: {
      used: Number(vmEntry.VMS_USED || 0),
      limit: parseLimit(vmEntry.VMS),
    },
    memoryMb: {
      used: Number(vmEntry.MEMORY_USED || 0),
      limit: parseLimit(vmEntry.MEMORY),
    },
    cpu: {
      used: Number(vmEntry.CPU_USED || 0),
      limit: parseLimit(vmEntry.CPU),
    },
    diskMb: {
      used: Number(vmEntry.DISK_SIZE_USED || 0),
      limit: parseLimit(vmEntry.DISK_SIZE),
    },
  };
}

export async function getUserQuotaAndUsage(opennebulaUsername) {
  const userXml = await callOne("one.user.info", [-1], opennebulaUsername);
  const userParsed = parseOneXml(userXml);
  const userObj = userParsed?.USER || {};
  const gid = Number(userObj.GID ?? env.oneDefaultGroupId);

  const userQuotas = extractVmQuota(userObj.VM_QUOTA);

  let groupQuotas = null;
  try {
    const groupXml = await callOne("one.group.info", [gid], env.oneServerUser);
    const groupParsed = parseOneXml(groupXml);
    groupQuotas = extractVmQuota(groupParsed?.GROUP?.VM_QUOTA);
  } catch {
    groupQuotas = null;
  }

  return {
    opennebulaUserId: Number(userObj.ID),
    opennebulaUsername: userObj.NAME,
    groupId: gid,
    groupName: userObj.GNAME || "users",
    userQuotas,
    groupQuotas,
  };
}

export async function getInfrastructureCapacity() {
  const adminActor = env.oneServerUser;
  const [hostPoolXml, dsPoolXml] = await Promise.all([
    callOne("one.hostpool.info", [], adminActor),
    callOne("one.datastorepool.info", [], adminActor),
  ]);

  const hostsRaw = parseOneXml(hostPoolXml)?.HOST_POOL?.HOST || [];
  const datastoresRaw = parseOneXml(dsPoolXml)?.DATASTORE_POOL?.DATASTORE || [];

  const hosts = hostsRaw.map((h) => {
    const share = h.HOST_SHARE || {};
    const totalMemKb = Number(share.TOTAL_MEM || 0);
    const usedMemKb = Number(share.MEM_USAGE || 0);
    const freeMemKb = Number(share.FREE_MEM || 0);
    const totalCpu = Number(share.TOTAL_CPU || 0);
    const allocatedCpu = Number(share.CPU_USAGE || 0);

    return {
      id: Number(h.ID),
      name: h.NAME,
      stateCode: Number(h.STATE),
      stateLabel: Number(h.STATE) === 2 ? "MONITORED" : `STATE_${h.STATE}`,
      runningVms: Number(share.RUNNING_VMS || 0),
      totalMemoryMb: Math.round(totalMemKb / 1024),
      allocatedMemoryMb: Math.round(usedMemKb / 1024),
      freeMemoryMb: Math.round(freeMemKb / 1024),
      totalCpuUnits: totalCpu,
      allocatedCpuUnits: allocatedCpu,
    };
  });

  const datastores = datastoresRaw.map((ds) => ({
    id: Number(ds.ID),
    name: ds.NAME,
    type: ds.TYPE === 0 ? "IMAGE" : ds.TYPE === 1 ? "SYSTEM" : "FILE",
    stateLabel: Number(ds.STATE) === 0 ? "READY" : `STATE_${ds.STATE}`,
    totalMb: Number(ds.TOTAL_MB || 0),
    usedMb: Number(ds.USED_MB || 0),
    freeMb: Number(ds.FREE_MB || 0),
  }));

  const availableMemoryMb = hosts
    .filter((h) => h.stateCode === 2)
    .reduce(
      (acc, h) => acc + Math.max(0, h.totalMemoryMb - h.allocatedMemoryMb),
      0,
    );

  const availableCpuUnits = hosts
    .filter((h) => h.stateCode === 2)
    .reduce(
      (acc, h) => acc + Math.max(0, h.totalCpuUnits - h.allocatedCpuUnits),
      0,
    );

  const systemDs = datastores.find((d) => d.type === "SYSTEM") || datastores[0];
  const availableDiskMb = systemDs ? systemDs.freeMb : 0;

  return {
    hosts,
    datastores,
    summary: {
      availableMemoryMb,
      availableCpuUnits,
      availableDiskMb,
    },
  };
}
