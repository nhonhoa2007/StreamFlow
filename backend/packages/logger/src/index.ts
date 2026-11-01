import crypto from "node:crypto";
import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateOrGenerateRequestId(input?: string): string {
  if (input && VALID_REQUEST_ID_REGEX.test(input)) {
    return input;
  }
  return crypto.randomUUID();
}

const DEFAULT_REDACT_PATHS = [
  "password",
  "*.password",
  "*.*.password",
  "*.*.*.password",
  "token",
  "*.token",
  "*.*.token",
  "*.*.*.token",
  "authorization",
  "*.authorization",
  "*.*.authorization",
  "*.*.*.authorization",
  "secret",
  "*.secret",
  "*.*.secret",
  "*.*.*.secret",
  "cookie",
  "*.cookie",
  "*.*.cookie",
  "*.*.*.cookie",
  "jwt",
  "*.jwt",
  "*.*.jwt",
  "*.*.*.jwt",
];

const SIGNATURE_PARAM_REGEX = /(X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token)=[^&"'\s]+/gi;

export function sanitizeString(val: string): string {
  return val.replace(SIGNATURE_PARAM_REGEX, "$1=[REDACTED]");
}

export function sanitizeValue(val: unknown, seen = new WeakSet()): unknown {
  if (typeof val === "string") {
    return sanitizeString(val);
  }
  if (!val || typeof val !== "object") {
    return val;
  }
  if (seen.has(val)) {
    return "[Circular]";
  }
  seen.add(val);

  if (val instanceof Error) {
    const errObj: Record<string, unknown> = {
      type: val.name,
      message: sanitizeString(val.message),
      stack: val.stack ? sanitizeString(val.stack) : undefined,
    };
    for (const [k, v] of Object.entries(val)) {
      errObj[k] = sanitizeValue(v, seen);
    }
    return errObj;
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValue(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val)) {
    result[k] = sanitizeValue(v, seen);
  }
  return result;
}

export function createLogger(options?: LoggerOptions, destination?: DestinationStream): Logger {
  const callerRedact = Array.isArray(options?.redact)
    ? options.redact
    : (options?.redact as { paths?: string[] })?.paths || [];

  const mergedRedactPaths = Array.from(new Set([...DEFAULT_REDACT_PATHS, ...callerRedact]));

  const baseOptions: LoggerOptions = {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: mergedRedactPaths,
      censor: "[REDACTED]",
    },
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => sanitizeValue(object) as Record<string, unknown>,
    },
    hooks: {
      logMethod(inputArgs, method) {
        const sanitizedArgs = inputArgs.map((arg) => {
          if (typeof arg === "string") {
            return sanitizeString(arg);
          }
          return arg;
        });
        return (method as (...args: unknown[]) => void).apply(this, sanitizedArgs);
      },
    },
    ...options,
  };

  return destination ? pino(baseOptions, destination) : pino(baseOptions);
}
