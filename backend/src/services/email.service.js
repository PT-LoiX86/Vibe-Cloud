import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const hasRealSmtpCredentials =
  env.smtpUser &&
  env.smtpPassword &&
  !env.smtpUser.includes("your-email@") &&
  !env.smtpPassword.includes("your-16-char");

const transporter = hasRealSmtpCredentials
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPassword,
      },
    })
  : null;

export async function sendVerificationCodeEmail({ to, username, code }) {
  const subject = "Verify your Private IaaS Portal account";
  const text = [
    `Hello ${username},`,
    "",
    `Your verification code is: ${code}`,
    `This code expires in ${env.emailCodeTtlMinutes} minutes.`,
    "",
    "After verifying your email, an administrator will activate your account so you can create virtual machines.",
  ].join("\n");

  if (!transporter) {
    console.warn(
      `[SMTP_PLACEHOLDER] Configure SMTP_USER and SMTP_PASSWORD in backend/.env to send real Gmail emails.`,
    );
    console.info(`[DEV_VERIFICATION_CODE] Recipient: ${to} | Code: ${code}`);
    return { delivered: false, mode: "console_fallback" };
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text,
  });

  return { delivered: true, mode: "smtp" };
}
