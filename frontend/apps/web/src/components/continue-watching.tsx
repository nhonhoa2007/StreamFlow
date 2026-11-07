"use client";
import type { ContinueItem } from "@streamflow/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { fetchContinueWatching } from "../lib/media-api";
import { usePlayback } from "../lib/playback-context";
import { FeedbackState } from "./feedback-state";
import { MediaCard } from "./media-card";
import { MediaRail } from "./media-rail";
export function ContinueWatching() {
  const { user, accessToken } = useAuth();
  const { resume, state } = usePlayback();
  const [items, setItems] = useState<ContinueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh history when the current title changes.
  useEffect(() => {
    if (!accessToken) {
      setItems([]);
      return;
    }
    let active = true;
    setLoading(true);
    fetchContinueWatching(accessToken).then((result) => {
      if (active) {
        setItems(result.items);
        setError(result.error ?? "");
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [accessToken, state.currentItem?.id]);
  if (!user) return null;
  if (loading) return <FeedbackState kind="loading" title="Picking up where you left off" />;
  if (error)
    return <FeedbackState kind="error" title="Your history is taking a moment" message={error} />;
  if (!items.length) return null;
  return (
    <MediaRail
      title="Continue watching"
      items={items.map((item) => item.media)}
      viewAllHref="/library"
      renderItem={(media) => {
        const progress = items.find((item) => item.mediaId === media.id);
        if (!progress) return null;
        return (
          <MediaCard
            item={media}
            progressPercent={
              media.durationMs ? Math.round((progress.positionMs / media.durationMs) * 100) : 0
            }
            onPlay={() => void resume(media, progress.positionMs)}
            onOpenDetails={() => router.push(`/media/${media.id}`)}
          />
        );
      }}
    />
  );
}
