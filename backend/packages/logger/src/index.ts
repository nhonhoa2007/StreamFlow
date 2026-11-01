import crypto from "node:crypto";
import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateOrGenerateRequestId(input?: string): string {
  if (input && VALID_REQUEST_ID_REGEX.test(input)) {
    return input;
  }
  return crypto.randomUUID();
}

const REDACT_PATHS = [
  "password",
  "*.password",
  "*.*.password",
  "token",
  "*.token",
  "*.*.token",
  "authorization",
  "*.authorization",
  "*.*.authorization",
  "secret",
  "*.secret",
  "*.*.secret",
  "cookie",
  "*.cookie",
  "*.*.cookie",
  "jwt",
  "*.jwt",
  "*.*.jwt",
];

function sanitizeUrls(obj: Record<string, unknown>): Record<string, unknown> {
  const res: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      res[k] = v.replace(
        /(X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token)=[^&]+/gi,
        "$1=[REDACTED]",
      );
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      res[k] = sanitizeUrls(v as Record<string, unknown>);
    } else {
      res[k] = v;
    }
  }
  return res;
}

export function createLogger(options?: LoggerOptions, destination?: DestinationStream): Logger {
  const baseOptions: LoggerOptions = {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => sanitizeUrls(object),
    },
    ...options,
  };

  return destination ? pino(baseOptions, destination) : pino(baseOptions);
}
