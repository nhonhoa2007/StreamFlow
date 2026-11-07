import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminWorkspace } from "./admin-workspace";
const auth = vi.hoisted(() => ({
  user: null as { role: "ADMIN" | "USER" } | null,
  accessToken: "test",
  isLoading: false,
  openAuthModal: () => {},
}));
vi.mock("../lib/auth-context", () => ({ useAuth: () => auth }));
describe("Studio rendering without authenticated browser access", () => {
  beforeEach(() => {
    auth.user = null;
  });
  it("renders sign-in guidance without an upload input for guests", () => {
    const html = renderToStaticMarkup(createElement(AdminWorkspace));
    expect(html).toContain("Sign in to open Studio");
    expect(html).not.toContain('type="file"');
  });
  it("hides upload controls for standard users", () => {
    auth.user = { role: "USER" };
    const html = renderToStaticMarkup(createElement(AdminWorkspace));
    expect(html).toContain("This space is for administrators");
    expect(html).not.toContain('type="file"');
  });
  it("renders labeled upload fields and supported types for the admin role", () => {
    auth.user = { role: "ADMIN" };
    const html = renderToStaticMarkup(createElement(AdminWorkspace));
    expect(html).toContain('for="media-title-input"');
    expect(html).toContain('id="media-file-input"');
    expect(html).toContain('accept="video/mp4,video/webm,video/quicktime"');
  });
});
