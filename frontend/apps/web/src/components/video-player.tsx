"use client";

import type { PlaybackManifestResponse } from "@streamflow/contracts";
import Hls from "hls.js";
import { Loader2, Settings, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchPlaybackManifest } from "../lib/media-api";

export function VideoPlayer({
  mediaId,
  title,
  onClose,
}: {
  mediaId: string;
  title: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manifest, setManifest] = useState<PlaybackManifestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [qualityLevels, setQualityLevels] = useState<{ id: number; label: string }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const hlsRef = useRef<Hls | null>(null);

  // 1. Fetch Manifest
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchPlaybackManifest(mediaId)
      .then((res) => {
        if (!isMounted) return;
        if (res.error || !res.data) {
          setError(res.error || "Failed to load video manifest");
        } else {
          setManifest(res.data);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [mediaId]);

  // 2. Initialize HLS Player
  useEffect(() => {
    if (!manifest || !videoRef.current) return;
    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls({
        capLevelToPlayerSize: true,
      });
      hlsRef.current = hls;

      hls.loadSource(manifest.masterPlaylistUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels = data.levels.map((lvl, idx) => ({
          id: idx,
          label: lvl.name || `${lvl.height}p`,
        }));
        setQualityLevels(levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_, err) => {
        if (err.fatal) {
          setError(`HLS error: ${err.type}`);
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = manifest.masterPlaylistUrl;
    } else {
      setError("HLS playback is not supported on this browser.");
    }
  }, [manifest]);

  function handleQualityChange(newLevel: number) {
    setCurrentLevel(newLevel);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = newLevel;
    }
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[2000] animate-fade-in">
      <div className="bg-[#0a0a0a] rounded-lg overflow-hidden w-full max-w-[880px] shadow-2xl shadow-black/80 animate-slide-up border border-[#262626]">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#141414] border-b border-[#262626]">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sf-accent/20 text-sf-accent">
              HLS ABR
            </span>
            <h3 className="text-sm font-medium text-white truncate max-w-[400px]">{title}</h3>
          </div>

          <div className="flex items-center gap-3">
            {qualityLevels.length > 0 && (
              <div className="flex items-center gap-2">
                <Settings size={14} className="text-[#6b6b6b]" />
                <select
                  id="hls-quality-select"
                  value={currentLevel}
                  onChange={(e) => handleQualityChange(Number(e.target.value))}
                  className="bg-[#0a0a0a] text-white text-xs border border-[#262626] rounded-md px-2 py-1 focus:outline-none focus:border-sf-accent"
                >
                  <option value={-1}>Auto</option>
                  {qualityLevels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-white">
              <span className="sr-only">Playback speed</span>
              <select
                aria-label="Playback speed"
                value={playbackRate}
                onChange={(e) => {
                  const rate = Number(e.target.value);
                  setPlaybackRate(rate);
                  if (videoRef.current) videoRef.current.playbackRate = rate;
                }}
                className="bg-[#0a0a0a] text-white text-xs border border-[#262626] rounded-md px-2 py-1"
              >
                <option value={0.5}>0.5×</option>
                <option value={0.75}>0.75×</option>
                <option value={1}>1×</option>
                <option value={1.25}>1.25×</option>
                <option value={1.5}>1.5×</option>
                <option value={2}>2×</option>
              </select>
            </label>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[#6b6b6b] hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Video Area */}
        <div className="relative w-full bg-black min-h-[360px] flex items-center justify-center">
          {isLoading && (
            <div className="flex items-center gap-2 text-[#6b6b6b]">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Loading stream...</span>
            </div>
          )}
          {error && <p className="text-red-400 text-sm px-4">{error}</p>}
          {/* biome-ignore lint/a11y/useMediaCaption: captions are rendered when the manifest provides a subtitle URL. */}
          <video
            ref={videoRef}
            controls
            playsInline
            className={`w-full max-h-[500px] ${isLoading || error ? "hidden" : "block"}`}
          >
            {manifest?.subtitleUrl && (
              <track kind="captions" src={manifest.subtitleUrl} srcLang="en" label="Captions" />
            )}
          </video>
        </div>
      </div>
    </div>
  );
}
