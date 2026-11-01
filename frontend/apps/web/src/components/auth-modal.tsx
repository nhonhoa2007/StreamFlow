"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth-context";

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, login, register } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAuthModalOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const action = isRegisterMode ? register : login;
    const res = await action(email, password);

    setIsSubmitting(false);
    if (!res.success) {
      setError(res.error || "Authentication failed");
    } else {
      setEmail("");
      setPassword("");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "400px",
          padding: "2rem",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#0f172a" }}>
            {isRegisterMode ? "Create an Account" : "Sign In to StreamFlow"}
          </h2>
          <button
            type="button"
            onClick={closeAuthModal}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(false);
              setError(null);
            }}
            style={{
              flex: 1,
              padding: "0.5rem",
              border: "none",
              borderBottom: !isRegisterMode ? "2px solid #2563eb" : "2px solid transparent",
              background: "none",
              fontWeight: !isRegisterMode ? 600 : 400,
              color: !isRegisterMode ? "#2563eb" : "#64748b",
              cursor: "pointer",
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(true);
              setError(null);
            }}
            style={{
              flex: 1,
              padding: "0.5rem",
              border: "none",
              borderBottom: isRegisterMode ? "2px solid #2563eb" : "2px solid transparent",
              background: "none",
              fontWeight: isRegisterMode ? 600 : 400,
              color: isRegisterMode ? "#2563eb" : "#64748b",
              cursor: "pointer",
            }}
          >
            Register
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "0.75rem",
              backgroundColor: "#fef2f2",
              color: "#b91c1c",
              borderRadius: "4px",
              fontSize: "0.85rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label
              htmlFor="auth-email-input"
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "#334155",
                marginBottom: "0.25rem",
              }}
            >
              Email address
            </label>
            <input
              id="auth-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              style={{
                width: "100%",
                padding: "0.6rem",
                borderRadius: "4px",
                border: "1px solid #cbd5e1",
                fontSize: "0.95rem",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="auth-password-input"
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "#334155",
                marginBottom: "0.25rem",
              }}
            >
              Password {isRegisterMode && "(min 8 chars, letter + number)"}
            </label>
            <input
              id="auth-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "0.6rem",
                borderRadius: "4px",
                border: "1px solid #cbd5e1",
                fontSize: "0.95rem",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              marginTop: "0.5rem",
              padding: "0.75rem",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              fontWeight: 600,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Processing..." : isRegisterMode ? "Create Account" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
