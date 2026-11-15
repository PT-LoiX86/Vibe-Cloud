import crypto from "node:crypto";
import { callOne } from "./xmlrpc-client.js";
import { parseOneXml } from "./xml-parser.js";
import { env } from "../../config/env.js";

function sanitizeOneUsername(raw) {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/^[^a-z0-9]+/, "");
  return (cleaned || "user").slice(0, 24);
}

export async function provisionOpenNebulaUser(
  appUsername,
  existingOneUserId = null,
  existingOneUsername = null,
) {
  const adminActor = env.oneServerUser;

  if (existingOneUserId && existingOneUsername) {
    return {
      opennebulaUserId: existingOneUserId,
      opennebulaUsername: existingOneUsername,
    };
  }

  const poolXml = await callOne("one.userpool.info", [], adminActor);
  const parsed = parseOneXml(poolXml);
  const existingUsers = parsed?.USER_POOL?.USER || [];
  const takenNames = new Set(
    existingUsers.map((u) => String(u.NAME).toLowerCase()),
  );

  const baseName = sanitizeOneUsername(appUsername);
  let candidate = baseName;
  let suffix = 1;
  while (takenNames.has(candidate)) {
    candidate = `${baseName.slice(0, 19)}_${suffix}`;
    suffix += 1;
  }

  const randomOnePassword = crypto.randomBytes(24).toString("hex");
  const userId = await callOne(
    "one.user.allocate",
    [candidate, randomOnePassword, "core", [env.oneDefaultGroupId]],
    adminActor,
  );

  return {
    opennebulaUserId: Number(userId),
    opennebulaUsername: candidate,
  };
}

export async function applyUserQuota(
  opennebulaUserId,
  { maxVms = 2, maxMemoryMb = 3072, maxCpu = 2.0, maxDiskGb = 20 } = {},
) {
  const adminActor = env.oneServerUser;
  const diskMb = Math.round(Number(maxDiskGb) * 1024);
  const quotaTemplate = `VM = [ VMS = ${Number(maxVms)}, MEMORY = ${Number(maxMemoryMb)}, CPU = ${Number(maxCpu).toFixed(2)}, DISK_SIZE = ${diskMb} ]`;
  await callOne(
    "one.user.quota",
    [Number(opennebulaUserId), quotaTemplate],
    adminActor,
  );
}

export async function applyDefaultUserQuota(opennebulaUserId) {
  return applyUserQuota(opennebulaUserId);
}
