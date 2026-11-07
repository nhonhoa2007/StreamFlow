"use client";
import { Heart, Loader2 } from "lucide-react";
import { useLibrary } from "../lib/library-context";
export function FavoriteButton({ mediaId }: { mediaId: string }) {
  const { savedIds, pendingIds, toggle } = useLibrary();
  const saved = savedIds.has(mediaId);
  return (
    <button
      type="button"
      aria-label={saved ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={saved}
      disabled={pendingIds.has(mediaId)}
      onClick={() => void toggle(mediaId)}
      className="icon-button disabled:opacity-50"
    >
      {pendingIds.has(mediaId) ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Heart size={16} fill={saved ? "currentColor" : "none"} />
      )}
    </button>
  );
}
