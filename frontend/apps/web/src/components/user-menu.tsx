"use client";

import { LogOut, Shield } from "lucide-react";
import Link from "next/link";
import { useAuth } from "../lib/auth-context";

export function UserMenu() {
  const { user, isLoading, logout, openAuthModal } = useAuth();

  if (isLoading) {
    return <div className="h-8 w-20 bg-[#141414] rounded-lg animate-skeleton" />;
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={openAuthModal}
        className="min-h-11 px-4 py-1.5 bg-sf-accent hover:bg-sf-accent-hover text-white text-sm font-semibold rounded-lg transition-all duration-200"
      >
        Sign In
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-sf-accent flex items-center justify-center text-white text-xs font-bold uppercase">
          {user.email.charAt(0)}
        </div>
        <span className="text-sm text-[#a1a1a1] hidden sm:block max-w-[150px] truncate">
          {user.email}
        </span>
        <Link
          href="/profile"
          className="hidden text-xs text-sf-text-muted hover:text-white sm:block"
        >
          Profile
        </Link>
        {user.role === "ADMIN" && (
          <Link
            href="/admin"
            className="flex min-h-11 items-center gap-1 rounded-lg bg-sf-accent/10 px-3 text-[10px] font-semibold text-sf-text-primary"
          >
            <Shield size={10} />
            Studio
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={logout}
        title="Logout"
        aria-label="Sign out"
        className="p-1.5 text-[#6b6b6b] hover:text-white hover:bg-[#1a1a1a] rounded-lg transition-all duration-200"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}
