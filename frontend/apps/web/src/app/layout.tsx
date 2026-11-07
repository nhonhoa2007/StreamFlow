import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import { AuthProvider } from "../lib/auth-context";
import { LibraryProvider } from "../lib/library-context";
import { PlaybackProvider } from "../lib/playback-context";
import "./globals.css";

export const metadata = {
  title: "StreamFlow — Minimal Media Streaming",
  description: "Next-gen Video on Demand & Media Streaming Platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-sf-base text-white antialiased selection:bg-sf-accent selection:text-white">
        <AuthProvider>
          <LibraryProvider>
            <PlaybackProvider>
              <AppShell>{children}</AppShell>
            </PlaybackProvider>
          </LibraryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
