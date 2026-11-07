"use client";
import { Heart, Library } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { useLibrary } from "../lib/library-context";
import { fetchHistory } from "../lib/media-api";
import { usePlayback } from "../lib/playback-context";
import { ContinueWatching } from "./continue-watching";
import { FeedbackState } from "./feedback-state";
import { MediaCard } from "./media-card";
export function LibrarySurface() {
  const { user, accessToken, isLoading, openAuthModal } = useAuth();
  const { favorites, loading, error, toggle, refresh } = useLibrary();
  const { play } = usePlayback();
  const router = useRouter();
  const [history, setHistory] = useState<Awaited<ReturnType<typeof fetchHistory>>["items"]>([]);
  const [historyError, setHistoryError] = useState<string>();
  useEffect(() => {
    if (!user || !accessToken) {
      setHistory([]);
      return;
    }
    void fetchHistory(accessToken).then((result) => {
      setHistory(result.items);
      setHistoryError(result.error);
    });
  }, [user, accessToken]);
  return (
    <div className="page-content">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Your library</h1>
          <p className="mt-4 text-sm text-sf-text-muted">Your saved titles and recent activity.</p>
        </div>
        <Link href="/playlists" className="button-secondary">
          Playlists
        </Link>
      </div>
      {isLoading ? (
        <FeedbackState kind="loading" title="Opening your library" />
      ) : !user ? (
        <div className="rounded-lg border border-white/10 bg-sf-surface p-10 text-center sm:p-16">
          <Library size={34} className="mx-auto mb-5 text-sf-accent" />
          <h2 className="font-display text-3xl">Save your favorites.</h2>
          <p className="mx-auto mb-6 mt-3 max-w-md text-sm leading-6 text-sf-text-muted">
            Sign in to save the titles you love and pick up right where you left off.
          </p>
          <button type="button" onClick={openAuthModal} className="button-primary">
            Sign in to your library
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          <ContinueWatching />
          <section>
            <div className="mb-5 flex items-center gap-3">
              <h2 className="text-xl font-semibold">History</h2>
              <span className="ml-auto text-xs text-sf-text-muted">{history.length} titles</span>
            </div>
            {historyError ? (
              <FeedbackState
                kind="error"
                title="Couldn't open your history"
                message={historyError}
              />
            ) : history.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-6 gap-y-9">
                {history.map(({ media }) => (
                  <MediaCard
                    key={media.id}
                    item={media}
                    fluid
                    onPlay={(item) => void play(item)}
                    onOpenDetails={(item) => router.push(`/media/${item.id}`)}
                  />
                ))}
              </div>
            ) : (
              <FeedbackState
                kind="empty"
                title="Your history is empty"
                message="Play a title and it will appear here."
              />
            )}
          </section>
          <section>
            <div className="mb-5 flex items-center gap-3">
              <Heart size={19} className="text-sf-accent" />
              <h2 className="text-xl font-semibold">Saved for later</h2>
              <span className="ml-auto text-xs text-sf-text-muted">{favorites.length} titles</span>
            </div>
            {loading ? (
              <FeedbackState kind="loading" title="Finding your favorites" />
            ) : error ? (
              <FeedbackState
                kind="error"
                title="Couldn't open your favorites"
                message={error}
                action={
                  <button type="button" onClick={refresh} className="button-secondary">
                    Try again
                  </button>
                }
              />
            ) : favorites.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-6 gap-y-9">
                {favorites.map(({ media }) => (
                  <MediaCard
                    key={media.id}
                    item={media}
                    fluid
                    isFavorited
                    onPlay={(item) => void play(item)}
                    onOpenDetails={(item) => router.push(`/media/${item.id}`)}
                    onToggleFavorite={(item) => void toggle(item.id)}
                  />
                ))}
              </div>
            ) : (
              <FeedbackState
                kind="empty"
                title="Good things are worth saving"
                message="Tap the heart on a title to keep it here."
                action={
                  <Link href="/search" className="button-secondary">
                    Find your next favorite
                  </Link>
                }
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
