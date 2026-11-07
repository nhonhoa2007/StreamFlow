import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

function tryLoadEnv(): void {
  if (typeof process.loadEnvFile === "function") {
    const candidates = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../../.env"),
      path.resolve(process.cwd(), "../../../.env"),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        try {
          process.loadEnvFile(file);
          break;
        } catch {
          // ignore malformed or unreadable file
        }
      }
    }
  }
}

const commonEnvShape = {
  NODE_ENV: z
    .enum(["development", "production", "test"], {
      errorMap: () => ({ message: "NODE_ENV must be 'development', 'production', or 'test'" }),
    })
    .default("development"),
  PORT: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === "") return 3000;
      if (typeof val === "string") {
        const n = Number(val);
        return Number.isInteger(n) ? n : val;
      }
      return val;
    }, z.number().int().min(1).max(65535))
    .default(3000),
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .url({ message: "DATABASE_URL must be a valid connection URL" }),
  REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
  CACHE_TTL_SECONDS: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === "") return 60;
      if (typeof val === "string") {
        const n = Number(val);
        return Number.isInteger(n) ? n : val;
      }
      return val;
    }, z.number().int().positive())
    .default(60),
  TRANSCODE_QUEUE_NAME: z.string().default("media-transcode-queue"),
  TRANSCODE_CONCURRENCY: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === "") return 2;
      if (typeof val === "string") {
        const n = Number(val);
        return Number.isInteger(n) ? n : val;
      }
      return val;
    }, z.number().int().positive())
    .default(2),
  TRANSCODE_MAX_ATTEMPTS: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === "") return 3;
      if (typeof val === "string") {
        const n = Number(val);
        return Number.isInteger(n) ? n : val;
      }
      return val;
    }, z.number().int().positive())
    .default(3),
  KAFKA_BROKERS: z.string().default("127.0.0.1:9092"),
  KAFKA_PLAYBACK_TOPIC: z.string().default("media-playback-events"),
  KAFKA_CONSUMER_GROUP: z.string().default("streamflow-analytics-group"),
  CORS_ORIGINS: z.string().optional(),
  ENABLE_EXPERIMENTS: z.enum(["true", "false"]).optional(),
  STORAGE_PROVIDER: z.enum(["minio", "cloudflare_r2"]).optional(),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_BUCKET_NAME: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().url().optional(),
};

const jwtSecretSchema = z
  .string({ required_error: "JWT_SECRET is required" })
  .min(32, { message: "JWT_SECRET must be at least 32 characters long" });

const optionalJwtSecretSchema = z.string().min(32).optional();

type StorageEnvironment = {
  NODE_ENV: "development" | "production" | "test";
  JWT_SECRET?: string;
  STORAGE_PROVIDER?: string;
  STORAGE_ENDPOINT?: string;
  STORAGE_BUCKET_NAME?: string;
  STORAGE_ACCESS_KEY_ID?: string;
  STORAGE_SECRET_ACCESS_KEY?: string;
};

function validateProductionEnvironment(
  env: StorageEnvironment,
  ctx: z.RefinementCtx,
  options: { requireStorage: boolean; requireJwt: boolean },
): void {
  if (
    options.requireJwt &&
    env.NODE_ENV === "production" &&
    env.JWT_SECRET?.startsWith("REPLACE_WITH_")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_SECRET"],
      message: "JWT_SECRET must be replaced with a random production secret",
    });
  }

  if (env.NODE_ENV !== "production" || !options.requireStorage) return;

  const requiredProductionStorageFields = [
    "STORAGE_PROVIDER",
    "STORAGE_ENDPOINT",
    "STORAGE_BUCKET_NAME",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
  ] as const;

  for (const field of requiredProductionStorageFields) {
    const value = env[field];
    if (!value || value.startsWith("REPLACE_WITH_")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required in production`,
      });
    }
  }
}

const ApiEnvRawSchema = z
  .object({ ...commonEnvShape, JWT_SECRET: jwtSecretSchema })
  .superRefine((env, ctx) =>
    validateProductionEnvironment(env, ctx, { requireJwt: true, requireStorage: true }),
  );

const ServiceEnvRawSchema = (requireStorage: boolean) =>
  z
    .object({ ...commonEnvShape, JWT_SECRET: optionalJwtSecretSchema })
    .superRefine((env, ctx) =>
      validateProductionEnvironment(env, ctx, { requireJwt: false, requireStorage }),
    );

export type ApiEnv = z.infer<typeof ApiEnvRawSchema>;
export type ServiceEnv = z.infer<ReturnType<typeof ServiceEnvRawSchema>>;

function parseEnvironment<T extends z.ZodTypeAny>(
  source: NodeJS.ProcessEnv,
  schema: T,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue: z.ZodIssue) => {
      const field = issue.path.join(".");
      return `Configuration error for ${field}: ${issue.message}`;
    });
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }
  return result.data as z.infer<T>;
}

export function parseApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  if (source === process.env) {
    tryLoadEnv();
  }
  return parseEnvironment(source, ApiEnvRawSchema);
}

export function parseServiceEnv(
  source: NodeJS.ProcessEnv = process.env,
  options: { requireStorage?: boolean } = {},
): ServiceEnv {
  if (source === process.env) {
    tryLoadEnv();
  }
  return parseEnvironment(source, ServiceEnvRawSchema(options.requireStorage === true));
}
