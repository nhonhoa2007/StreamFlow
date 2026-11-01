"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { toggleFavorite } from "../lib/media-api";

export function FavoriteButton({ mediaId }: { mediaId: string }) {
  const { accessToken, user, openAuthModal } = useAuth();
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleToggle() {
    if (!user || !accessToken) {
      openAuthModal();
      return;
    }

    setIsLoading(true);
    const nextState = await toggleFavorite(accessToken, mediaId, isFavorited);
    setIsFavorited(nextState);
    setIsLoading(false);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isLoading}
      title={isFavorited ? "Remove from Favorites" : "Add to Favorites"}
      style={{
        background: "none",
        border: "none",
        cursor: isLoading ? "not-allowed" : "pointer",
        fontSize: "1.2rem",
        color: isFavorited ? "#ef4444" : "#94a3b8",
        padding: "0.25rem",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isFavorited ? "★" : "☆"}
    </button>
  );
}
