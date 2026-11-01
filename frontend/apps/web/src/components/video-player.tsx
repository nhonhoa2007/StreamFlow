"use client";

import type { PlaybackManifestResponse } from "@streamflow/contracts";
import Hls from "hls.js";
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
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 is Auto
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
      // Native Safari/iOS HLS fallback
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "#0f172a",
          borderRadius: "12px",
          overflow: "hidden",
          width: "100%",
          maxWidth: "880px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1.25rem",
            backgroundColor: "#1e293b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "0.15rem 0.5rem",
                borderRadius: "4px",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
              }}
            >
              HLS ABR
            </span>
            <h3 style={{ margin: 0, fontSize: "1rem", color: "#f8fafc" }}>{title}</h3>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {qualityLevels.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label
                  htmlFor="hls-quality-select"
                  style={{ fontSize: "0.8rem", color: "#94a3b8" }}
                >
                  Quality:
                </label>
                <select
                  id="hls-quality-select"
                  value={currentLevel}
                  onChange={(e) => handleQualityChange(Number(e.target.value))}
                  style={{
                    backgroundColor: "#0f172a",
                    color: "#f8fafc",
                    border: "1px solid #475569",
                    borderRadius: "4px",
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.8rem",
                  }}
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
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                fontSize: "1.5rem",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            width: "100%",
            backgroundColor: "#000000",
            minHeight: "360px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isLoading && <p style={{ color: "#94a3b8" }}>Loading HLS stream manifest...</p>}
          {error && <p style={{ color: "#ef4444", padding: "1rem" }}>{error}</p>}
          <video
            ref={videoRef}
            controls
            playsInline
            style={{
              width: "100%",
              maxHeight: "500px",
              display: isLoading || error ? "none" : "block",
            }}
          >
            <track kind="captions" />
          </video>
        </div>
      </div>
    </div>
  );
}
