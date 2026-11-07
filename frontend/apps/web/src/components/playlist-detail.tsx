"use client";

import type { PlaylistDetail as PlaylistDetailType } from "@streamflow/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { fetchPlaylistDetail, removePlaylistItem, reorderPlaylistItems } from "../lib/media-api";

export function PlaylistDetail({ id }: { id: string }) {
  const { accessToken } = useAuth();
  const [playlist, setPlaylist] = useState<PlaylistDetailType>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await fetchPlaylistDetail(accessToken, id);
    setPlaylist(result.data);
    setError(result.error);
  }, [accessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!accessToken) return <p>Please sign in to view this playlist.</p>;
  if (!playlist) return <p>{error ?? "Loading..."}</p>;
  const token = accessToken;
  const currentPlaylist = playlist;

  async function move(index: number, direction: number) {
    const itemIds = currentPlaylist.items.map((item) => item.id);
    const target = index + direction;
    if (target < 0 || target >= itemIds.length) return;
    [itemIds[index], itemIds[target]] = [itemIds[target], itemIds[index]];
    const result = await reorderPlaylistItems(token, id, currentPlaylist.version, itemIds);
    if (result.status === 409) setError("Playlist changed elsewhere. Refreshing…");
    else if (result.error) setError(result.error);
    await load();
  }

  async function remove(itemId: string) {
    const result = await removePlaylistItem(token, id, itemId);
    if (result.error) setError(result.error);
    await load();
  }

  return (
    <section>
      <Link href="/playlists">← Playlists</Link>
      <h1>{playlist.name}</h1>
      <p>{playlist.description}</p>
      <p>{playlist.items.length} items</p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {playlist.items.map((item, index) => (
          <li key={item.id}>
            <strong>{item.media.title}</strong>{" "}
            <button type="button" onClick={() => void move(index, -1)} disabled={index === 0}>
              ↑
            </button>
            <button
              type="button"
              onClick={() => void move(index, 1)}
              disabled={index === playlist.items.length - 1}
            >
              ↓
            </button>
            <button type="button" onClick={() => void remove(item.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <p>
        <small>To add media, use the media details playlist picker.</small>
      </p>
    </section>
  );
}
