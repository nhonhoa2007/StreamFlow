"use client";
import { Maximize2, Pause, Play, SkipForward, X } from "lucide-react";
import { usePlayback } from "../lib/playback-context";
import { MediaArtwork } from "./media-artwork";
import { formatMediaDuration } from "./media-primitives";
export function MiniPlayer() {
  const { state, dispatch, close, togglePlayback, playNext } = usePlayback();
  const item = state.currentItem;
  if (!item || state.expanded) return null;
  return (
    <aside aria-label="Mini player" className="mini-player">
      <button
        type="button"
        aria-label={`Expand player for ${item.title}`}
        onClick={() => dispatch({ type: "EXPAND", expanded: true })}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <MediaArtwork
          title={item.title}
          type={item.type}
          className="hidden h-12 w-16 shrink-0 rounded-lg sm:block"
        />
        <span className="min-w-0">
          <span className="eyebrow">Now playing</span>
          <span className="block truncate text-sm font-semibold">{item.title}</span>
          <span className="text-[11px] text-sf-text-muted">
            {formatMediaDuration(state.positionMs)}
            {state.status === "error" ? " · Playback unavailable" : ""}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={state.status === "playing" ? "Pause" : "Play"}
        className="icon-button"
      >
        {state.status === "playing" ? <Pause size={19} /> : <Play size={19} />}
      </button>
      <button
        type="button"
        onClick={playNext}
        disabled={!state.queue.length}
        aria-label="Play next"
        className="icon-button disabled:opacity-30"
      >
        <SkipForward size={19} />
      </button>
      <button
        type="button"
        aria-label="Expand player"
        onClick={() => dispatch({ type: "EXPAND", expanded: true })}
        className="icon-button hidden sm:flex"
      >
        <Maximize2 size={17} />
      </button>
      <button type="button" onClick={close} aria-label="Stop playback" className="icon-button">
        <X size={18} />
      </button>
    </aside>
  );
}
