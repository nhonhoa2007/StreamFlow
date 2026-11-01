import { describe, expect, it } from "vitest";
import { generateOpaqueToken, hashPassword, hashToken, verifyPassword } from "./crypto.util.js";

describe("Crypto Utilities", () => {
  describe("Password Hashing (Argon2id)", () => {
    it("hashes password into an Argon2id format string", async () => {
      const hash = await hashPassword("SecureP@ssw0rd123");
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it("verifies matching password correctly", async () => {
      const password = "MySecretPassword123";
      const hash = await hashPassword(password);
      const isMatch = await verifyPassword(hash, password);
      expect(isMatch).toBe(true);
    });

    it("rejects non-matching password", async () => {
      const hash = await hashPassword("OriginalPass123");
      const isMatch = await verifyPassword(hash, "WrongPassword123");
      expect(isMatch).toBe(false);
    });
  });

  describe("Token Hashing & Generation", () => {
    it("generates 32-byte hex raw token and matching SHA-256 tokenHash", () => {
      const { rawToken, tokenHash } = generateOpaqueToken();
      expect(rawToken).toHaveLength(64);
      expect(tokenHash).toHaveLength(64);
      expect(hashToken(rawToken)).toBe(tokenHash);
    });

    it("produces deterministic SHA-256 hash for identical token string", () => {
      const token = "fixed_token_value_abc_123";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
    });
  });
});
