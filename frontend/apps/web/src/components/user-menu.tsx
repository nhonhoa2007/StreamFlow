"use client";

import { useAuth } from "../lib/auth-context";

export function UserMenu() {
  const { user, isLoading, logout, openAuthModal } = useAuth();

  if (isLoading) {
    return <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Loading...</span>;
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={openAuthModal}
        style={{
          padding: "0.4rem 0.8rem",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          border: "none",
          borderRadius: "4px",
          fontSize: "0.85rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Sign In
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.85rem", color: "#f8fafc" }}>{user.email}</span>
        <span
          style={{
            fontSize: "0.7rem",
            padding: "0.15rem 0.4rem",
            borderRadius: "4px",
            backgroundColor: user.role === "ADMIN" ? "#dc2626" : "#475569",
            color: "#ffffff",
            fontWeight: 600,
          }}
        >
          {user.role}
        </span>
      </div>
      <button
        type="button"
        onClick={logout}
        style={{
          padding: "0.3rem 0.6rem",
          backgroundColor: "transparent",
          color: "#94a3b8",
          border: "1px solid #475569",
          borderRadius: "4px",
          fontSize: "0.8rem",
          cursor: "pointer",
        }}
      >
        Logout
      </button>
    </div>
  );
}
