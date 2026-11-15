import crypto from "node:crypto";
import { prisma } from "../config/prisma.js";

export function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  return req.session.csrfToken;
}

export function verifyCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  // Unauthenticated endpoints do not yet hold a session cookie
  if (!req.session?.userId) {
    return next();
  }
  const headerToken = req.get("x-csrf-token");
  if (!headerToken || headerToken !== req.session.csrfToken) {
    return res.status(403).json({ error: "Invalid or missing CSRF token." });
  }
  return next();
}

export async function attachUser(req, res, next) {
  if (!req.session?.userId) {
    req.currentUser = null;
    return next();
  }
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
  });
  if (!user) {
    req.session.destroy(() => {});
    req.currentUser = null;
    return next();
  }
  req.currentUser = user;
  return next();
}

export function requireAuth(req, res, next) {
  if (!req.currentUser) {
    return res.status(401).json({ error: "Authentication required." });
  }
  return next();
}

export function requireActiveUser(req, res, next) {
  if (!req.currentUser) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (req.currentUser.accountStatus !== "ACTIVE") {
    return res.status(403).json({
      error:
        "Your account is not active yet. Please wait for administrator approval.",
      accountStatus: req.currentUser.accountStatus,
    });
  }
  return next();
}

export function requireAdmin(req, res, next) {
  if (
    !req.currentUser ||
    req.currentUser.role !== "ADMIN" ||
    req.currentUser.accountStatus !== "ACTIVE"
  ) {
    return res
      .status(403)
      .json({ error: "Administrator privileges required." });
  }
  return next();
}

const buckets = new Map();
export function rateLimit({
  windowMs = 60_000,
  max = 10,
  keyPrefix = "rl",
} = {}) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}`;
    const now = Date.now();
    const record = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }
    record.count += 1;
    buckets.set(key, record);
    if (record.count > max) {
      return res
        .status(429)
        .json({
          error: "Too many requests. Please wait a moment and try again.",
        });
    }
    return next();
  };
}
