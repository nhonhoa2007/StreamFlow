import { describe, expect, it } from "vitest";
import {
  AuthResponseSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  UserSummarySchema,
} from "./auth.js";

describe("Auth Schemas", () => {
  describe("RegisterRequestSchema", () => {
    it("validates and normalizes email to lowercase and trimmed", () => {
      const res = RegisterRequestSchema.parse({
        email: "  TestUser@Example.COM  ",
        password: "Password123",
      });
      expect(res.email).toBe("testuser@example.com");
      expect(res.password).toBe("Password123");
    });

    it("rejects password shorter than 8 characters", () => {
      const res = RegisterRequestSchema.safeParse({
        email: "user@example.com",
        password: "Pass1",
      });
      expect(res.success).toBe(false);
    });

    it("rejects password without numbers", () => {
      const res = RegisterRequestSchema.safeParse({
        email: "user@example.com",
        password: "PasswordOnlyLetters",
      });
      expect(res.success).toBe(false);
    });

    it("rejects password without letters", () => {
      const res = RegisterRequestSchema.safeParse({
        email: "user@example.com",
        password: "1234567890",
      });
      expect(res.success).toBe(false);
    });
  });

  describe("LoginRequestSchema", () => {
    it("validates login inputs", () => {
      const res = LoginRequestSchema.parse({
        email: " USER@TEST.COM ",
        password: "mypassword",
      });
      expect(res.email).toBe("user@test.com");
      expect(res.password).toBe("mypassword");
    });

    it("rejects empty password", () => {
      expect(
        LoginRequestSchema.safeParse({
          email: "user@test.com",
          password: "",
        }).success,
      ).toBe(false);
    });
  });

  describe("AuthResponseSchema & UserSummarySchema", () => {
    it("validates AuthResponse format", () => {
      const data = {
        accessToken: "jwt-token-string",
        user: {
          id: "3c5e88bb-8da7-4e76-8f83-e18e3a2b7b5c",
          email: "user@example.com",
          role: "USER" as const,
        },
      };
      expect(AuthResponseSchema.parse(data)).toEqual(data);
    });

    it("validates UserSummarySchema", () => {
      const summary = {
        id: "3c5e88bb-8da7-4e76-8f83-e18e3a2b7b5c",
        email: "admin@example.com",
        role: "ADMIN" as const,
        createdAt: new Date().toISOString(),
      };
      expect(UserSummarySchema.parse(summary)).toEqual(summary);
    });
  });
});
