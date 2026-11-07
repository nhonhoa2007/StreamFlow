import { describe, expect, it } from "vitest";
import { getAdminAccess, validateUploadFile } from "./admin-access";
describe("admin workspace", () => {
  it("keeps the studio restricted to admins", () => {
    expect(getAdminAccess(null, true)).toBe("loading");
    expect(getAdminAccess(null, false)).toBe("sign-in");
    expect(getAdminAccess({ role: "USER" }, false)).toBe("denied");
    expect(getAdminAccess({ role: "ADMIN" }, false)).toBe("allowed");
  });
  it("validates file size and MIME before starting an upload", () => {
    expect(validateUploadFile({ size: 0, type: "video/mp4" }, "VIDEO")).toMatch(/empty/i);
    expect(validateUploadFile({ size: 6 * 1024 ** 3, type: "video/mp4" }, "VIDEO")).toMatch(
      /5 GiB/i,
    );
    expect(validateUploadFile({ size: 10, type: "audio/mpeg" }, "VIDEO")).toMatch(/video/i);
    expect(validateUploadFile({ size: 10, type: "video/mp4" }, "VIDEO")).toBeNull();
  });
});
