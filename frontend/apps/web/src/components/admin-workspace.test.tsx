import { describe, expect, it } from "vitest";
import { getAdminAccess } from "./admin-access";
describe("admin workspace access", () => {
  it("only allows administrators", () => {
    expect(getAdminAccess({ role: "USER" }, false)).toBe("denied");
    expect(getAdminAccess({ role: "ADMIN" }, false)).toBe("allowed");
  });
});
