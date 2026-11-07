"use client";

import Hls from "hls.js";
import {
  ChevronDown,
  ListMusic,
  Loader2,
  Maximize2,
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { fetchPlaybackManifest, updatePlaybackProgress } from "../lib/media-api";
import { usePlayback } from "../lib/playback-context";
import { ProgressSync } from "../lib/progress-sync";
import { MediaArtwork } from "./media-artwork";

export function PlayerShell() {
  const playback = usePlayback();
  const { state, mediaRef, dispatch, flushRef } = playback;
  const { accessToken } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const latest = useRef({ playback, accessToken });
  latest.current = { playback, accessToken };
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<{ id: number; label: string }[]>([]);
  const [quality, setQuality] = useState(-1);
  const [buffering, setBuffering] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitleUrl, setSubtitleUrl] = useState<string | undefined>();
  const lastSave = useRef(0);
  const sync = useRef<{ sessionId: string; token: string; tracker: ProgressSync } | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (state.currentItem && state.expanded && !dialog.open) dialog.showModal();
    else if ((!state.currentItem || !state.expanded) && dialog.open) dialog.close();
  }, [state.currentItem, state.expanded]);

  const mediaId = state.currentItem?.id;
  const revision = state.revision;
  const sessionPending = state.sessionPending;
  useEffect(() => {
    const video = mediaRef.current;
    if (!mediaId || !video || sessionPending) return;
    let cancelled = false;
    loaded.current = false;
    lastSave.current = 0;
    setQuality(-1);
    setLevels([]);
    setBuffering(true);
    setSubtitleUrl(undefined);
    const fail = () => {
      if (cancelled) return;
      setBuffering(false);
      dispatch({
        type: "ERROR",
        mediaId,
        error: "This title couldn't be played. Check your connection and try again.",
      });
    };
    fetchPlaybackManifest(mediaId)
      .then((result) => {
        if (cancelled || latest.current.playback.state.revision !== revision) return;
        if (!result.data) {
          fail();
          return;
        }
        const source = result.data.sourceUrl ?? result.data.masterPlaylistUrl;
        setSubtitleUrl(result.data.subtitleUrl);
        if (!source) {
          fail();
          return;
        }
        if (!source.includes(".m3u8")) {
          video.src = source;
          video.load();
        } else if (Hls.isSupported()) {
          const hls = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 30 });
          hlsRef.current = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            setLevels(
              data.levels.map((level, id) => ({ id, label: level.name || `${level.height}p` })),
            );
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) fail();
          });
          hls.loadSource(source);
          hls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = source;
        } else fail();
      })
      .catch(fail);
    return () => {
      cancelled = true;
      loaded.current = false;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [mediaId, revision, mediaRef, dispatch, sessionPending]);

  function saveProgress(force = false) {
    const { state: current } = latest.current.playback;
    const token = latest.current.accessToken;
    const video = mediaRef.current;
    if (!video || !loaded.current || !current.currentItem) return;
    const positionMs = Math.floor(video.currentTime * 1000);
    dispatch({ type: "PROGRESS", positionMs });
    if (!token || !current.sessionId || (!force && Date.now() - lastSave.current < 10000)) return;
    lastSave.current = Date.now();
    const sessionId = current.sessionId;
    if (sync.current?.sessionId !== sessionId || sync.current?.token !== token) {
      sync.current = {
        sessionId,
        token,
        tracker: new ProgressSync(
          (payload) => updatePlaybackProgress(token, sessionId, payload),
          () => {
            if (latest.current.playback.state.sessionId === sessionId)
              latest.current.playback.setNotice(
                "Your progress couldn't be synced. Playback will continue.",
              );
          },
        ),
      };
    }
    void sync.current.tracker.push(positionMs);
  }

  useEffect(() => {
    flushRef.current = () => saveProgress(true);
    return () => {
      flushRef.current = null;
    };
  });

  const item = state.currentItem;
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="player-title"
      onCancel={(event) => {
        event.preventDefault();
        dispatch({ type: "EXPAND", expanded: false });
      }}
      className="player-dialog"
    >
      <div className="player-window">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="eyebrow">Now playing</p>
            <h2 id="player-title" className="truncate font-semibold">
              {item?.title ?? "StreamFlow player"}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Minimize player"
              title="Keep playing"
              onClick={() => dispatch({ type: "EXPAND", expanded: false })}
              className="icon-button"
            >
              <ChevronDown size={20} />
            </button>
            <button
              type="button"
              aria-label="Stop playback"
              onClick={() => {
                saveProgress(true);
                playback.close();
              }}
              className="icon-button"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="relative bg-black">
          {item?.type === "AUDIO" && (
            <MediaArtwork
              title={item.title}
              type="AUDIO"
              variant="hero"
              className="h-[250px] sm:h-[330px]"
            />
          )}
          {/* biome-ignore lint/a11y/useMediaCaption: captions are rendered when the manifest provides a subtitle URL. */}
          <video
            key={mediaId ?? "empty"}
            ref={mediaRef}
            controls
            playsInline
            preload="metadata"
            aria-label={item?.title ? `Playback: ${item.title}` : "Media playback"}
            className={item?.type === "AUDIO" ? "h-16 w-full" : "aspect-video max-h-[65vh] w-full"}
            onLoadedMetadata={() => {
              const video = mediaRef.current;
              if (!video) return;
              loaded.current = true;
              const position = latest.current.playback.state.positionMs;
              if (position > 0) video.currentTime = position / 1000;
              void video.play().catch(() => dispatch({ type: "STATUS", status: "paused" }));
            }}
            onPlaying={() => {
              setBuffering(false);
              dispatch({ type: "STATUS", status: "playing" });
            }}
            onWaiting={() => setBuffering(true)}
            onCanPlay={() => setBuffering(false)}
            onPause={() => {
              if (loaded.current && latest.current.playback.state.status !== "error") {
                dispatch({ type: "STATUS", status: "paused" });
                saveProgress(true);
              }
            }}
            onTimeUpdate={() => saveProgress()}
            onEnded={() => {
              latest.current.playback.playNext();
            }}
            onError={() => {
              if (item)
                dispatch({
                  type: "ERROR",
                  mediaId: item.id,
                  error: "This title isn't available to play right now. Please try again.",
                });
            }}
          >
            {subtitleUrl && (
              <track kind="captions" src={subtitleUrl} label="Captions" srcLang="en" />
            )}
          </video>
          {buffering && state.status !== "error" && (
            <output className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
              <span className="flex items-center gap-3 rounded-full bg-black/70 px-5 py-3 text-sm">
                <Loader2 size={18} className="animate-spin" />
                Preparing your stream
              </span>
            </output>
          )}
          {state.status === "error" && (
            <div
              role="alert"
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-sf-base p-6 text-center"
            >
              <p className="max-w-sm text-sm text-sf-text-secondary">{state.error}</p>
              <button type="button" onClick={playback.retry} className="button-primary">
                <RotateCcw size={16} />
                Try again
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 text-xs text-sf-text-secondary">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-sf-accent" />
            {item?.type === "AUDIO" ? "Audio" : "Video"} ·{" "}
            {state.status === "error" ? "Unavailable" : "Made for your moment"}
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="sr-only">Playback speed</span>
              <select
                aria-label="Playback speed"
                value={playbackRate}
                onChange={(e) => {
                  const rate = Number(e.target.value);
                  setPlaybackRate(rate);
                  if (mediaRef.current) mediaRef.current.playbackRate = rate;
                }}
                className="rounded-lg border border-white/10 bg-sf-surface px-3 py-2 text-white"
              >
                <option value={0.5}>0.5×</option>
                <option value={0.75}>0.75×</option>
                <option value={1}>1×</option>
                <option value={1.25}>1.25×</option>
                <option value={1.5}>1.5×</option>
                <option value={2}>2×</option>
              </select>
            </label>
            {levels.length > 0 && (
              <label className="flex items-center gap-2">
                Quality
                <select
                  aria-label="Playback quality"
                  value={quality}
                  onChange={(event) => {
                    const level = Number(event.target.value);
                    setQuality(level);
                    if (hlsRef.current) hlsRef.current.currentLevel = level;
                  }}
                  className="rounded-lg border border-white/10 bg-sf-surface px-3 py-2 text-white"
                >
                  <option value={-1}>Auto</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="Enter fullscreen"
              onClick={() =>
                void mediaRef.current
                  ?.requestFullscreen?.()
                  .catch(() => playback.setNotice("Fullscreen is unavailable in this browser."))
              }
            >
              <Maximize2 size={17} />
            </button>
          </div>
        </div>
        {playback.notice && (
          <output className="block border-t border-white/10 bg-sf-accent/5 px-5 py-3 text-xs text-sf-text-primary">
            {playback.notice}
          </output>
        )}
        {state.queue.length > 0 && (
          <div className="border-t border-white/10 px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold">
                <ListMusic size={15} />
                Up next · {state.queue.length}
              </span>
              <button
                type="button"
                onClick={playback.playNext}
                className="flex items-center gap-1 text-xs text-sf-accent"
              >
                Play next
                <SkipForward size={13} />
              </button>
            </div>
            <div className="max-h-28 overflow-y-auto">
              {state.queue.map((queued) => (
                <div key={queued.id} className="flex items-center justify-between gap-2 py-1">
                  <button
                    type="button"
                    onClick={() => void playback.play(queued)}
                    className="truncate py-2 text-left text-sm text-sf-text-secondary hover:text-white"
                  >
                    {queued.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${queued.title} from queue`}
                    onClick={() => playback.removeFromQueue(queued.id)}
                    className="icon-button"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
