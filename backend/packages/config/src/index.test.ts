import { describe, expect, it } from "vitest";
import { parseApiEnv } from "./index.js";

describe("parseApiEnv", () => {
  const validDbUrl = "postgres://postgres:postgres@localhost:5432/streamflow";
  const validJwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";

  it("parses valid env with defaults", () => {
    const config = parseApiEnv({
      DATABASE_URL: validDbUrl,
      JWT_SECRET: validJwtSecret,
    });

    expect(config).toEqual({
      NODE_ENV: "development",
      PORT: 3000,
      DATABASE_URL: validDbUrl,
      JWT_SECRET: validJwtSecret,
    });
  });

  it("parses custom PORT and NODE_ENV", () => {
    const config = parseApiEnv({
      NODE_ENV: "production",
      PORT: "8080",
      DATABASE_URL: validDbUrl,
      JWT_SECRET: validJwtSecret,
    });

    expect(config).toEqual({
      NODE_ENV: "production",
      PORT: 8080,
      DATABASE_URL: validDbUrl,
      JWT_SECRET: validJwtSecret,
    });
  });

  it("throws error when JWT_SECRET is missing or less than 32 characters", () => {
    expect(() =>
      parseApiEnv({
        DATABASE_URL: validDbUrl,
      }),
    ).toThrow(/JWT_SECRET/);

    expect(() =>
      parseApiEnv({
        DATABASE_URL: validDbUrl,
        JWT_SECRET: "short-secret",
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it("throws error when DATABASE_URL is missing", () => {
    expect(() => parseApiEnv({})).toThrow(/DATABASE_URL/);
  });

  it("throws error without leaking secret values when DATABASE_URL is invalid", () => {
    const secretUrl = "not-a-valid-url-secret123";
    try {
      parseApiEnv({ DATABASE_URL: secretUrl });
      expect.fail("Should have thrown error");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message).not.toContain(secretUrl);
      expect(message).toMatch(/DATABASE_URL/);
    }
  });

  it("throws error when PORT is invalid", () => {
    expect(() =>
      parseApiEnv({
        DATABASE_URL: validDbUrl,
        PORT: "not-a-port",
      }),
    ).toThrow(/PORT/);

    expect(() =>
      parseApiEnv({
        DATABASE_URL: validDbUrl,
        PORT: "70000",
      }),
    ).toThrow(/PORT/);

    expect(() =>
      parseApiEnv({
        DATABASE_URL: validDbUrl,
        PORT: "0",
      }),
    ).toThrow(/PORT/);
  });

  it("throws error when NODE_ENV is unrecognized", () => {
    expect(() =>
      parseApiEnv({
        DATABASE_URL: validDbUrl,
        NODE_ENV: "staging",
      }),
    ).toThrow(/NODE_ENV/);
  });
});
