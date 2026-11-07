"use client";
import type { MediaDetail, MediaItem } from "@streamflow/contracts";
import { ArrowLeft, Check, ListPlus, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { useLibrary } from "../lib/library-context";
import { addPlaylistItem, fetchPlaylists } from "../lib/media-api";
import { usePlayback } from "../lib/playback-context";
import { FeedbackState } from "./feedback-state";
import { MediaArtwork } from "./media-artwork";
import { ClassificationLabels, MediaCard } from "./media-card";
import { formatMediaDuration } from "./media-primitives";
import { MediaRail } from "./media-rail";
export function MediaDetails({
  item,
  related,
  error,
}: { item?: MediaDetail; related: MediaItem[]; error?: string }) {
  const { play, enqueue } = usePlayback();
  const { toggle, savedIds, pendingIds } = useLibrary();
  const { accessToken, openAuthModal } = useAuth();
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlists, setPlaylists] = useState<{ id: string; name: string }[]>([]);
  const [playlistMessage, setPlaylistMessage] = useState<string>();
  const router = useRouter();
  async function openPlaylistPicker() {
    if (!accessToken) {
      openAuthModal();
      return;
    }
    setPlaylistMessage(undefined);
    const result = await fetchPlaylists(accessToken);
    setPlaylists(result.data ?? []);
    setPlaylistMessage(result.error);
    setPlaylistOpen(true);
  }

  async function addToPlaylist(playlistId: string) {
    if (!accessToken || !item) return;
    const result = await addPlaylistItem(accessToken, playlistId, item.id);
    setPlaylistMessage(result.error ?? "Added to playlist.");
  }
  if (!item)
    return (
      <div className="page-content">
        <Link
          href="/"
          className="mb-7 inline-flex items-center gap-2 text-xs text-sf-text-secondary"
        >
          <ArrowLeft size={16} />
          Back to discover
        </Link>
        <FeedbackState
          kind="error"
          title="We couldn't find this title"
          message={
            error
              ? "It may have moved, or the collection is temporarily unavailable."
              : "Explore the collection to find something else."
          }
          action={
            <Link href="/search" className="button-secondary">
              Explore titles
            </Link>
          }
        />
      </div>
    );
  return (
    <div className="page-content">
      <Link
        href="/"
        className="mb-7 inline-flex items-center gap-2 text-xs text-sf-text-secondary hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to discover
      </Link>
      <section className="mb-12 grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <MediaArtwork
          title={item.title}
          type={item.type}
          variant="hero"
          className="aspect-[4/3] w-full rounded-lg border border-white/10"
        />
        <div>
          <p className="eyebrow mb-5">
            {item.type === "AUDIO" ? "Find your frequency" : "A story worth your time"}
          </p>
          <h1 className="page-title">{item.title}</h1>
          <div className="my-5 flex gap-3 text-xs text-sf-text-secondary">
            <span>{item.type === "AUDIO" ? "Audio" : "Film"}</span>
            <span>·</span>
            <span>{formatMediaDuration(item.durationMs)}</span>
          </div>
          <ClassificationLabels labels={item.classificationLabels} />
          <p className="max-w-lg text-sm leading-7 text-sf-text-muted">
            {item.type === "AUDIO"
              ? "A soundtrack for your own story. Put on your headphones and make a little room for the unexpected."
              : "Settle into a different perspective. Discover a moment beyond the everyday in the StreamFlow collection."}
          </p>
          {item.artists.length > 0 && (
            <p className="mt-4 text-xs text-sf-text-secondary">
              With {item.artists.map((artist) => artist.name).join(", ")}
            </p>
          )}
          {item.album && <p className="mt-2 text-xs text-sf-text-muted">From {item.album.title}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="button-primary" onClick={() => void play(item)}>
              <Play size={16} fill="currentColor" />
              {item.type === "AUDIO" ? "Listen now" : "Watch now"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void toggle(item.id)}
              aria-pressed={savedIds.has(item.id)}
              disabled={pendingIds.has(item.id)}
            >
              {savedIds.has(item.id) ? <Check size={17} /> : <Plus size={17} />}
              {savedIds.has(item.id) ? "Saved" : "My list"}
            </button>
            <button
              type="button"
              aria-label="Add to Up next"
              title="Add to Up next"
              className="button-secondary"
              onClick={() => enqueue(item)}
            >
              <ListPlus size={18} />
              Up next
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void openPlaylistPicker()}
            >
              <ListPlus size={18} />
              Playlist
            </button>
          </div>
          {playlistOpen && (
            <div className="mt-4 rounded-lg border border-white/10 bg-sf-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold">Add to playlist</p>
                <button
                  type="button"
                  className="text-xs text-sf-text-muted"
                  onClick={() => setPlaylistOpen(false)}
                >
                  Close
                </button>
              </div>
              {playlists.length === 0 ? (
                <Link href="/playlists" className="text-xs text-sf-accent">
                  Create a playlist first
                </Link>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      type="button"
                      className="pill"
                      onClick={() => void addToPlaylist(playlist.id)}
                    >
                      {playlist.name}
                    </button>
                  ))}
                </div>
              )}
              {playlistMessage && (
                <output className="mt-3 block text-xs text-sf-text-muted">{playlistMessage}</output>
              )}
            </div>
          )}
        </div>
      </section>
      {related.length > 0 && (
        <MediaRail
          title="Keep the discovery going"
          eyebrow="From the collection"
          items={related}
          viewAllHref="/search"
          renderItem={(item) => (
            <MediaCard
              item={item}
              onPlay={(item) => void play(item)}
              onOpenDetails={(item) => router.push(`/media/${item.id}`)}
            />
          )}
        />
      )}
    </div>
  );
}
