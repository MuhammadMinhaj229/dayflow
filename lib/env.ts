import { z } from "zod";

const schema = z.object({
  MONGODB_URI: z.string().optional(),
  MONGODB_DB: z.string().default("dayflow"),
  DAYFLOW_ADMIN_EMAIL: z.string().email().optional(),
  DAYFLOW_ADMIN_PASSWORD_HASH: z.string().optional(),
  DAYFLOW_AUTH_SECRET: z.string().min(32).optional(),
  DAYFLOW_SESSION_COOKIE: z.string().default("dayflow_session"),
  DAYFLOW_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  DAYFLOW_SYNC_TOKEN: z.string().min(32).optional(),
  DAYFLOW_DEMO_MODE: z.enum(["true", "false"]).default("false"),
});

export const env = schema.parse({
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB: process.env.MONGODB_DB,
  DAYFLOW_ADMIN_EMAIL: process.env.DAYFLOW_ADMIN_EMAIL,
  DAYFLOW_ADMIN_PASSWORD_HASH: process.env.DAYFLOW_ADMIN_PASSWORD_HASH,
  DAYFLOW_AUTH_SECRET: process.env.DAYFLOW_AUTH_SECRET,
  DAYFLOW_SESSION_COOKIE: process.env.DAYFLOW_SESSION_COOKIE,
  DAYFLOW_SESSION_TTL_SECONDS: process.env.DAYFLOW_SESSION_TTL_SECONDS,
  DAYFLOW_SYNC_TOKEN: process.env.DAYFLOW_SYNC_TOKEN,
  DAYFLOW_DEMO_MODE: process.env.DAYFLOW_DEMO_MODE,
});

export const isDemoMode = env.DAYFLOW_DEMO_MODE === "true";
