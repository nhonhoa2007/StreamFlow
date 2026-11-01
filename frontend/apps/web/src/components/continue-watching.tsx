"use client";

import type { ContinueItem } from "@streamflow/contracts";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { fetchContinueWatching } from "../lib/media-api";

export function ContinueWatching() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<ContinueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user || !accessToken) {
      setItems([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    fetchContinueWatching(accessToken)
      .then((res) => {
        if (isMounted) setItems(res.items);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user, accessToken]);

  if (!user || (!isLoading && items.length === 0)) {
    return null;
  }

  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <h2 style={{ fontSize: "1.25rem", color: "#0f172a", marginBottom: "1rem" }}>
        Continue Listening & Watching
      </h2>

      {isLoading && items.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Loading resume progress...</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          {items.map((item) => {
            const progressPercent = item.media.durationMs
              ? Math.min(Math.round((item.positionMs / item.media.durationMs) * 100), 100)
              : 0;

            return (
              <div
                key={item.mediaId}
                style={{
                  padding: "1rem",
                  backgroundColor: "#ffffff",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      padding: "0.15rem 0.4rem",
                      borderRadius: "4px",
                      backgroundColor: item.media.type === "VIDEO" ? "#dbeafe" : "#fef3c7",
                      color: item.media.type === "VIDEO" ? "#1e40af" : "#92400e",
                    }}
                  >
                    {item.media.type}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {Math.floor(item.positionMs / 1000)}s resume
                  </span>
                </div>
                <h3
                  style={{
                    fontSize: "0.95rem",
                    margin: "0 0 0.5rem 0",
                    color: "#0f172a",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.media.title}
                </h3>
                <div
                  style={{
                    height: "4px",
                    backgroundColor: "#e2e8f0",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: "100%",
                      backgroundColor: "#2563eb",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
