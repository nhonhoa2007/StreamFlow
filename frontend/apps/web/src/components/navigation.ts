import { Home, ListMusic, type LucideIcon, Search } from "lucide-react";

export interface NavItem {
  id: "home" | "search" | "library";
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { id: "home", href: "/", icon: Home, label: "Home" },
  { id: "search", href: "/search", icon: Search, label: "Search" },
  { id: "library", href: "/library", icon: ListMusic, label: "Your Library" },
];

export function getActiveNavId(currentHref: string, pathname: string): NavItem["id"] {
  const currentPath = new URL(currentHref, "http://streamflow.local").pathname;
  const pathnameOnly = new URL(pathname, "http://streamflow.local").pathname;
  if (currentPath === "/") return pathnameOnly === "/" ? "home" : "home";
  if (pathnameOnly === currentPath || pathnameOnly.startsWith(`${currentPath}/`)) {
    return navItems.find((item) => item.href === currentPath)?.id ?? "home";
  }
  return "home";
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return item.href === "/"
    ? pathname === "/"
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
