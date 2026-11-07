"use client";

import { LogOut, Shield, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { useAuth } from "../lib/auth-context";
import { isNavItemActive, navItems } from "./navigation";

export function MobileNav() {
  const pathname = usePathname();
  const { user, openAuthModal, logout } = useAuth();
  const profileRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-white/10 bg-sf-base px-3 py-2  lg:hidden"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold transition-colors ${
                active ? "text-white" : "text-sf-text-muted"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.3 : 1.7} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="Open profile"
          onClick={() => (user ? profileRef.current?.showModal() : openAuthModal())}
          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold text-sf-text-muted"
        >
          <UserRound size={18} strokeWidth={1.7} />
          <span>Profile</span>
        </button>
      </nav>
      <dialog ref={profileRef} aria-labelledby="profile-title" className="auth-dialog">
        <div className="relative p-7">
          <button
            type="button"
            aria-label="Close profile"
            className="icon-button absolute right-2 top-2"
            onClick={() => profileRef.current?.close()}
          >
            <X size={19} />
          </button>
          <p className="eyebrow mb-3">Your StreamFlow</p>
          <h2 id="profile-title" className="font-display text-3xl">
            Make yourself at home.
          </h2>
          <p className="my-5 break-all text-sm text-sf-text-secondary">{user?.email}</p>
          <div className="flex flex-col gap-3">
            {user?.role === "ADMIN" && (
              <Link
                href="/admin"
                onClick={() => profileRef.current?.close()}
                className="button-secondary"
              >
                <Shield size={17} />
                Open Studio
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                profileRef.current?.close();
                void logout();
              }}
              className="button-secondary"
            >
              <LogOut size={17} />
              Sign out
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
