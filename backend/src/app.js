import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { env } from "./config/env.js";
import { attachUser, verifyCsrf } from "./middleware/auth.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import vmsRoutes from "./routes/vms.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const PgSession = connectPgSimple(session);
const pgPool = new pg.Pool({ connectionString: env.databaseUrl });

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.appOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "256kb" }));

  app.use(
    session({
      store: new PgSession({
        pool: pgPool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.nodeEnv === "production",
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(attachUser);
  app.use("/api", verifyCsrf);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api", catalogRoutes);
  app.use("/api", vmsRoutes);
  app.use("/api", adminRoutes);

  app.use((err, req, res, next) => {
    console.error("Unhandled API error:", err);
    res.status(500).json({ error: "An unexpected server error occurred." });
  });

  return app;
}
