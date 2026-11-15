import 'dotenv/config';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET || 'dev-change-me-session-secret',
  oneXmlrpcUrl: process.env.OPENNEBULA_XMLRPC_URL || 'http://127.0.0.1:2633/RPC2',
  oneServerUser: process.env.OPENNEBULA_SERVER_AUTH_USER || 'portal_server',
  oneServerSecret: process.env.OPENNEBULA_SERVER_AUTH_SECRET || '',
  oneDefaultGroupId: Number(process.env.OPENNEBULA_DEFAULT_GROUP_ID || 1),
  oneDefaultVnetId: Number(process.env.OPENNEBULA_DEFAULT_VNET_ID || 0),
  oneUiUrl: process.env.OPENNEBULA_UI_URL || 'http://localhost:2616',
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: String(process.env.SMTP_SECURE || 'true') === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@iaas.local',
  emailCodeTtlMinutes: Number(process.env.EMAIL_CODE_TTL_MINUTES || 10),
  emailCodeResendSeconds: Number(process.env.EMAIL_CODE_RESEND_SECONDS || 60),
  emailCodeMaxAttempts: Number(process.env.EMAIL_CODE_MAX_ATTEMPTS || 5),
};
