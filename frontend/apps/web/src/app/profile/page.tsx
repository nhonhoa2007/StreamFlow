"use client";

import { useEffect, useState } from "react";
import { ProfileSettings } from "../../components/profile-settings";
import { useAuth } from "../../lib/auth-context";
import { fetchCurrentUser } from "../../lib/media-api";

export default function ProfilePage() {
  const { user, accessToken, isLoading, openAuthModal, logout } = useAuth();
  const [createdAt, setCreatedAt] = useState<string>();
  useEffect(() => {
    if (!accessToken) return;
    void fetchCurrentUser(accessToken).then((result) => setCreatedAt(result.data?.createdAt));
  }, [accessToken]);

  if (isLoading) return <div className="page-content">Loading profile…</div>;
  if (!user) {
    return (
      <div className="page-content">
        <h1 className="page-title">Your profile</h1>
        <p className="mt-4 text-sm text-sf-text-muted">Sign in to manage your account.</p>
        <button type="button" onClick={openAuthModal} className="button-primary mt-6">
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="page-content">
      <p className="eyebrow mb-3">Account</p>
      <h1 className="page-title">Your profile</h1>
      <div className="mt-8">
        <ProfileSettings user={user} createdAt={createdAt} onLogout={() => void logout()} />
      </div>
    </div>
  );
}
