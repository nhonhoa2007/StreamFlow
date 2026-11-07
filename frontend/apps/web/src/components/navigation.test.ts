import { describe, expect, it } from "vitest";
import { getActiveNavId, navItems } from "./navigation";

describe("navigation", () => {
  it("defines the primary routes in display order", () => {
    expect(navItems.map((item) => item.href)).toEqual(["/", "/search", "/library"]);
  });

  it("marks nested routes as active for their parent surface", () => {
    expect(getActiveNavId("/", "/")).toBe("home");
    expect(getActiveNavId("/search", "/search?q=ocean")).toBe("search");
    expect(getActiveNavId("/library", "/library/favorites")).toBe("library");
    expect(getActiveNavId("/library", "/media/123")).toBe("home");
  });
});
