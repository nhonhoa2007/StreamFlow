import { z } from "zod";

const ApiEnvRawSchema = z.object({
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
});

export type ApiEnv = z.infer<typeof ApiEnvRawSchema>;

export function parseApiEnv(source: NodeJS.ProcessEnv): ApiEnv {
  const result = ApiEnvRawSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const field = issue.path.join(".");
      return `Configuration error for ${field}: ${issue.message}`;
    });
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }
  return result.data;
}
