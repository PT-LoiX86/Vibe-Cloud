import crypto from "node:crypto";
import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { sendVerificationCodeEmail } from "../services/email.service.js";
import { recordAudit } from "../services/audit.service.js";
import {
  ensureCsrfToken,
  rateLimit,
  requireAuth,
} from "../middleware/auth.middleware.js";

const router = Router();

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code).trim()).digest("hex");
}

function generateSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    opennebulaUserId: user.opennebulaUserId,
    opennebulaUsername: user.opennebulaUsername,
    opennebulaUiUrl: env.oneUiUrl,
    rejectionReason: user.rejectionReason,
    createdAt: user.createdAt,
    activatedAt: user.activatedAt,
  };
}

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(24, "Username must be at most 24 characters")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Username can only contain letters, numbers, dots, underscores, or hyphens",
    ),
  email: z.string().trim().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

router.post(
  "/register",
  rateLimit({ windowMs: 60_000, max: 8, keyPrefix: "reg" }),
  async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const username = parsed.data.username.toLowerCase();
    const email = parsed.data.email.toLowerCase();
    const passwordHash = await argon2.hash(parsed.data.password, {
      type: argon2.argon2id,
    });

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });

    if (existing) {
      return res.status(409).json({
        error:
          existing.email === email
            ? "This email is already registered."
            : "This username is already taken.",
      });
    }

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + env.emailCodeTtlMinutes * 60_000);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        role: "USER",
        accountStatus: "PENDING_EMAIL_VERIFICATION",
        verificationCodes: {
          create: {
            codeHash: hashCode(code),
            expiresAt,
          },
        },
      },
    });

    let mailStatus = "sent";
    try {
      const info = await sendVerificationCodeEmail({
        to: email,
        username,
        code,
      });
      mailStatus = info.mode;
    } catch (err) {
      console.error("SMTP send failed on registration:", err.message);
      mailStatus = "smtp_error";
    }

    await recordAudit({
      actorUserId: user.id,
      targetType: "User",
      targetId: user.id,
      action: "USER_REGISTERED",
      metadata: { mailStatus },
    });

    return res.status(201).json({
      message:
        "Account created. Please check your email for the 6-digit verification code.",
      email: user.email,
      mailStatus,
    });
  },
);

const verifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6, "Verification code must be 6 digits"),
});

router.post(
  "/verify-email",
  rateLimit({ windowMs: 60_000, max: 12, keyPrefix: "verify" }),
  async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res
        .status(400)
        .json({ error: "Invalid email or verification code." });
    }

    if (user.accountStatus !== "PENDING_EMAIL_VERIFICATION") {
      return res
        .status(400)
        .json({ error: "Email is already verified. You can sign in now." });
    }

    const latestCode = await prisma.emailVerificationCode.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!latestCode) {
      return res
        .status(400)
        .json({
          error:
            "No active verification code found. Please request a new code.",
        });
    }

    if (latestCode.expiresAt < new Date()) {
      return res
        .status(400)
        .json({
          error: "Verification code has expired. Please request a new code.",
        });
    }

    if (latestCode.attemptCount >= env.emailCodeMaxAttempts) {
      return res
        .status(400)
        .json({
          error:
            "Too many invalid attempts. Please request a new verification code.",
        });
    }

    if (hashCode(parsed.data.code) !== latestCode.codeHash) {
      await prisma.emailVerificationCode.update({
        where: { id: latestCode.id },
        data: { attemptCount: { increment: 1 } },
      });
      return res.status(400).json({ error: "Incorrect verification code." });
    }

    await prisma.$transaction([
      prisma.emailVerificationCode.update({
        where: { id: latestCode.id },
        data: { consumedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          accountStatus: "PENDING_ADMIN_ACTIVATION",
        },
      }),
    ]);

    await recordAudit({
      actorUserId: user.id,
      targetType: "User",
      targetId: user.id,
      action: "EMAIL_VERIFIED",
    });

    return res.json({
      message:
        "Email verified! Your account is now waiting for administrator activation.",
    });
  },
);

router.post(
  "/resend-verification",
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: "resend" }),
  async (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.accountStatus !== "PENDING_EMAIL_VERIFICATION") {
      return res.json({
        message:
          "If an unverified account exists for this email, a new code has been sent.",
      });
    }

    const latestCode = await prisma.emailVerificationCode.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    if (latestCode) {
      const elapsedSec = (Date.now() - latestCode.sentAt.getTime()) / 1000;
      if (elapsedSec < env.emailCodeResendSeconds) {
        const waitSec = Math.ceil(env.emailCodeResendSeconds - elapsedSec);
        return res
          .status(429)
          .json({
            error: `Please wait ${waitSec} seconds before requesting another code.`,
          });
      }
    }

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + env.emailCodeTtlMinutes * 60_000);

    await prisma.$transaction([
      prisma.emailVerificationCode.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.emailVerificationCode.create({
        data: {
          userId: user.id,
          codeHash: hashCode(code),
          expiresAt,
        },
      }),
    ]);

    try {
      await sendVerificationCodeEmail({
        to: user.email,
        username: user.username,
        code,
      });
    } catch (err) {
      console.error("SMTP resend failed:", err.message);
      return res
        .status(502)
        .json({
          error:
            "Unable to send email via SMTP. Please check server SMTP settings.",
        });
    }

    return res.json({
      message: "A new 6-digit verification code has been sent to your email.",
    });
  },
);

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

router.post(
  "/login",
  rateLimit({ windowMs: 60_000, max: 15, keyPrefix: "login" }),
  async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const identifier = parsed.data.identifier.toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });

    if (!user) {
      return res
        .status(401)
        .json({ error: "Invalid username/email or password." });
    }

    const valid = await argon2.verify(user.passwordHash, parsed.data.password);
    if (!valid) {
      return res
        .status(401)
        .json({ error: "Invalid username/email or password." });
    }

    if (user.accountStatus === "PENDING_EMAIL_VERIFICATION") {
      return res.status(403).json({
        error: "Please verify your email address before signing in.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
    }

    if (user.accountStatus === "REJECTED") {
      return res.status(403).json({
        error: user.rejectionReason
          ? `Account registration was rejected: ${user.rejectionReason}`
          : "Your account registration was rejected by an administrator.",
        code: "ACCOUNT_REJECTED",
      });
    }

    if (user.accountStatus === "SUSPENDED") {
      return res.status(403).json({
        error:
          "Your account has been suspended. Please contact an administrator.",
        code: "ACCOUNT_SUSPENDED",
      });
    }

    req.session.userId = user.id;
    const csrfToken = ensureCsrfToken(req);

    await recordAudit({
      actorUserId: user.id,
      targetType: "User",
      targetId: user.id,
      action: "USER_LOGGED_IN",
    });

    return res.json({
      user: serializeUser(user),
      csrfToken,
    });
  },
);

router.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "Signed out." });
  });
});

router.get("/me", (req, res) => {
  if (!req.currentUser) {
    return res.json({ user: null, csrfToken: null });
  }
  const csrfToken = ensureCsrfToken(req);
  return res.json({
    user: serializeUser(req.currentUser),
    csrfToken,
  });
});

export default router;
