import type { ReactNode } from "react";
import { AuthModal } from "../components/auth-modal";
import { UserMenu } from "../components/user-menu";
import { AuthProvider } from "../lib/auth-context";
import "./globals.css";

export const metadata = {
  title: "StreamFlow VOD",
  description: "Advanced Backend & Distributed Systems Lab",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <header
            style={{
              backgroundColor: "#0f172a",
              color: "#ffffff",
              padding: "1rem 2rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>StreamFlow</h1>
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.5rem",
                  backgroundColor: "#334155",
                  borderRadius: "4px",
                }}
              >
                M02 Identity & Catalog
              </span>
            </div>
            <UserMenu />
          </header>
          <main
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              padding: "2rem",
            }}
          >
            {children}
          </main>
          <AuthModal />
        </AuthProvider>
      </body>
    </html>
  );
}
