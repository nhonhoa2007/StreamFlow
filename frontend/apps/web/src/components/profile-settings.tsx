"use client";

import type { AuthUser } from "../lib/auth-context";

export function ProfileSettings({
  user,
  createdAt,
  onLogout,
}: { user: AuthUser; createdAt?: string; onLogout: () => void }) {
  return (
    <div className="max-w-xl rounded-lg border border-white/10 bg-sf-surface p-6">
      <dl className="space-y-5 text-sm">
        <div>
          <dt className="text-xs text-sf-text-muted">Email</dt>
          <dd className="mt-1">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-sf-text-muted">Role</dt>
          <dd className="mt-1">{user.role}</dd>
        </div>
        {createdAt && (
          <div>
            <dt className="text-xs text-sf-text-muted">Member since</dt>
            <dd className="mt-1">{new Date(createdAt).toLocaleDateString()}</dd>
          </div>
        )}
      </dl>
      <button type="button" onClick={onLogout} className="button-secondary mt-8">
        Sign out
      </button>
    </div>
  );
}
