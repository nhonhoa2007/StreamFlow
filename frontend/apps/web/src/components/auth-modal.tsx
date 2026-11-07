"use client";
import { ArrowUpRight, Eye, EyeOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth-context";
export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, login, register } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isAuthModalOpen && !dialog.open) {
      dialog.showModal();
      setError("");
    } else if (!isAuthModalOpen && dialog.open) dialog.close();
  }, [isAuthModalOpen]);
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isAuthModalOpen]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    const result = await (isRegisterMode ? register : login)(email.trim(), password);
    setIsSubmitting(false);
    if (result.success) {
      setEmail("");
      setPassword("");
    } else setError(result.error ?? "We couldn't sign you in. Please try again.");
  }
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="auth-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        closeAuthModal();
      }}
      className="auth-dialog"
    >
      <div className="relative p-7 sm:p-9">
        <button
          type="button"
          aria-label="Close sign in"
          onClick={closeAuthModal}
          className="icon-button absolute right-3 top-3"
        >
          <X size={19} />
        </button>
        <span className="mb-8 flex h-11 w-11 items-center justify-center rounded-lg bg-sf-accent/10 text-sm font-black text-sf-accent">
          SF
        </span>
        <p className="eyebrow mb-3">Make yourself at home</p>
        <h2 id="auth-modal-title" className="font-display text-3xl">
          {isRegisterMode ? "Your next chapter." : "Welcome back."}
        </h2>
        <p className="mb-7 mt-3 text-xs leading-6 text-sf-text-muted">
          {isRegisterMode
            ? "Keep your favorites close. Pick up wherever you left off."
            : "Your collection is right where you left it."}
        </p>
        <div className="mb-6 grid grid-cols-2 rounded-lg bg-sf-base p-1">
          {[false, true].map((mode) => (
            <button
              key={String(mode)}
              type="button"
              aria-pressed={isRegisterMode === mode}
              onClick={() => {
                setIsRegisterMode(mode);
                setError("");
              }}
              className={`min-h-11 rounded-lg text-xs font-semibold ${isRegisterMode === mode ? "bg-sf-elevated text-white" : "text-sf-text-muted"}`}
            >
              {mode ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs leading-5 text-rose-200"
          >
            {error}
          </p>
        )}
        <form onSubmit={submit} className="space-y-5" aria-busy={isSubmitting}>
          <div>
            <label
              htmlFor="auth-email-input"
              className="mb-2 block text-xs font-semibold text-sf-text-secondary"
            >
              Email address
            </label>
            <input
              id="auth-email-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="h-12 w-full rounded-lg border border-white/10 bg-sf-base px-4 text-sm placeholder:text-sf-text-muted"
            />
          </div>
          <div>
            <label
              htmlFor="auth-password-input"
              className="mb-2 block text-xs font-semibold text-sf-text-secondary"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="auth-password-input"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegisterMode ? "new-password" : "current-password"}
                required
                minLength={isRegisterMode ? 8 : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                className="h-12 w-full rounded-lg border border-white/10 bg-sf-base pl-4 pr-14 text-sm placeholder:text-sf-text-muted"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
                className="icon-button absolute right-1 top-0.5"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {isRegisterMode && (
              <p className="mt-2 text-[11px] text-sf-text-muted">
                At least 8 characters, including a letter and a number.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="button-primary w-full disabled:opacity-50"
          >
            {isSubmitting ? "One moment…" : isRegisterMode ? "Create your account" : "Sign in"}
            {!isSubmitting && <ArrowUpRight size={16} />}
          </button>
        </form>
      </div>
    </dialog>
  );
}
