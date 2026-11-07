"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useLibrary } from "../lib/library-context";
import { usePlayback } from "../lib/playback-context";
import { AuthModal } from "./auth-modal";
import { MiniPlayer } from "./mini-player";
import { MobileNav } from "./mobile-nav";
import { PlayerShell } from "./player-shell";
import { SearchTrigger } from "./search-trigger";
import { Sidebar } from "./sidebar";
import { UserMenu } from "./user-menu";

export function AppShell({
  children,
  miniPlayer,
}: { children: ReactNode; miniPlayer?: ReactNode }) {
  const { notice } = usePlayback();
  const { error } = useLibrary();
  return (
    <div className="min-h-screen bg-sf-base text-sf-text-primary">
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-4 border-b border-white/10 bg-sf-base px-4  sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="StreamFlow home">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sf-accent text-xs font-black tracking-tight text-white ">
            SF
          </span>
          <span className="hidden text-lg font-bold tracking-tight sm:block">
            Stream<span className="text-sf-accent">Flow</span>
          </span>
        </Link>
        <SearchTrigger />
        <div className="flex items-center gap-3">
          <Link
            href="/search"
            aria-label="Open search"
            className="rounded-full p-2 text-sf-text-muted hover:bg-white/10 hover:text-white md:hidden"
          >
            <Search size={18} />
          </Link>
          <UserMenu />
        </div>
      </header>
      <Sidebar />
      <main className="min-h-screen pb-24 pt-16 lg:ml-[84px] lg:pb-8">{children}</main>
      {miniPlayer ?? <MiniPlayer />}
      <PlayerShell />
      {(notice || error) && <output className="app-notice">{error || notice}</output>}
      <MobileNav />
      <AuthModal />
    </div>
  );
}
