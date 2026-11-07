import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MobileNav } from "./mobile-nav";
vi.mock("next/navigation", () => ({ usePathname: () => "/library" }));
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: null, openAuthModal: vi.fn(), logout: vi.fn() }),
}));
describe("mobile navigation", () => {
  it("includes Home, Search, Library and an accessible Profile action", () => {
    const markup = renderToStaticMarkup(createElement(MobileNav));
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/search"');
    expect(markup).toContain('href="/library"');
    expect(markup).toContain('aria-label="Open profile"');
  });
});
