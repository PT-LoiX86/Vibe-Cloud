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

  // Separate random password for OpenNebula core account
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

export async function applyDefaultUserQuota(opennebulaUserId) {
  const adminActor = env.oneServerUser;
  // Per-user quota tailored for group 'users' which has 4 VMs / 6144 MB total
  const quotaTemplate =
    "VM = [ VMS = 2, MEMORY = 3072, CPU = 2.0, DISK_SIZE = 20480 ]";
  await callOne(
    "one.user.quota",
    [Number(opennebulaUserId), quotaTemplate],
    adminActor,
  );
}
