import crypto from "node:crypto";
import pino, { type Logger, type LoggerOptions } from "pino";

const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateOrGenerateRequestId(input?: string): string {
  if (input && VALID_REQUEST_ID_REGEX.test(input)) {
    return input;
  }
  return crypto.randomUUID();
}

export function createLogger(options?: LoggerOptions): Logger {
  return pino({
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    ...options,
  });
}
