import type { DestinationStream } from "pino";
import { describe, expect, it } from "vitest";
import { createLogger, validateOrGenerateRequestId } from "./index.js";

describe("validateOrGenerateRequestId", () => {
  it("generates a new UUID when input is missing or empty", () => {
    const id1 = validateOrGenerateRequestId(undefined);
    const id2 = validateOrGenerateRequestId("");
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(id1).toMatch(uuidRegex);
    expect(id2).toMatch(uuidRegex);
    expect(id1).not.toBe(id2);
  });

  it("preserves valid bounded request ID", () => {
    const validId = "req_12345-abc_XYZ";
    expect(validateOrGenerateRequestId(validId)).toBe(validId);
  });

  it("replaces overlong request ID (> 64 chars) with a UUID", () => {
    const overlong = "a".repeat(65);
    const result = validateOrGenerateRequestId(overlong);
    expect(result).not.toBe(overlong);
    expect(result.length).toBe(36);
  });

  it("replaces request ID containing invalid/control characters with a UUID", () => {
    const invalidWithNewline = "req\nid\r";
    const invalidWithTab = "req\tid";
    const invalidWithSpaces = "req id with spaces";

    expect(validateOrGenerateRequestId(invalidWithNewline)).not.toBe(invalidWithNewline);
    expect(validateOrGenerateRequestId(invalidWithTab)).not.toBe(invalidWithTab);
    expect(validateOrGenerateRequestId(invalidWithSpaces)).not.toBe(invalidWithSpaces);
  });
});

describe("createLogger", () => {
  it("creates a logger instance producing JSON output", () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("redacts sensitive passwords, tokens, authorization headers, and presigned S3 signatures across strings, arrays, and errors", () => {
    let output = "";
    const stream = {
      write: (msg: string) => {
        output += msg;
      },
    };

    const logger = createLogger({}, stream as unknown as DestinationStream);

    const circularObj: Record<string, unknown> = { name: "cycle" };
    circularObj.self = circularObj;

    const errorWithSignature = new Error(
      "Failed to download https://s3.amazonaws.com/media.mp4?X-Amz-Signature=SigInError123",
    );

    logger.info(
      {
        password: "super-secret-password-123",
        nested: {
          deep: {
            password: "deep-secret-password-456",
          },
        },
        token: "secret-token-abc",
        authorization: "Bearer sensitive-auth-token",
        urls: [
          "https://s3.amazonaws.com/bucket/1.mp4?X-Amz-Signature=secretSigArray1",
          "https://s3.amazonaws.com/bucket/2.mp4?X-Amz-Credential=secretCredArray2",
        ],
        circular: circularObj,
        err: errorWithSignature,
      },
      "Downloading from https://s3.amazonaws.com/target?X-Amz-Signature=SigInMessageMsg",
    );

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("super-secret-password-123");
    expect(output).not.toContain("deep-secret-password-456");
    expect(output).not.toContain("secret-token-abc");
    expect(output).not.toContain("sensitive-auth-token");
    expect(output).not.toContain("secretSigArray1");
    expect(output).not.toContain("secretCredArray2");
    expect(output).not.toContain("SigInError123");
    expect(output).not.toContain("SigInMessageMsg");
    expect(output).toContain("[Circular]");
  });
});
