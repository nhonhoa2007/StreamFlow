"use client";

import type { PlaylistSummary } from "@streamflow/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { createPlaylist, deletePlaylist, fetchPlaylists, updatePlaylist } from "../lib/media-api";
import { PlaylistDialog } from "./playlist-dialog";

export function PlaylistList() {
  const { user, accessToken, openAuthModal } = useAuth();
  const [items, setItems] = useState<PlaylistSummary[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!accessToken) return;
    void fetchPlaylists(accessToken).then((result) => {
      setItems(result.data ?? []);
      setError(result.error);
    });
  }, [accessToken]);
  if (!user || !accessToken) {
    return (
      <p>
        Please{" "}
        <button type="button" onClick={openAuthModal}>
          sign in
        </button>{" "}
        to manage playlists.
      </p>
    );
  }
  const token = accessToken;
  async function create(name: string) {
    const result = await createPlaylist(token, { name });
    if (result.data) setItems((current) => [result.data as PlaylistSummary, ...current]);
    else setError(result.error);
  }
  async function rename(playlist: PlaylistSummary) {
    const name = window.prompt("Playlist name", playlist.name)?.trim();
    if (!name || name === playlist.name) return;
    const result = await updatePlaylist(token, playlist.id, { name });
    if (result.data)
      setItems((current) =>
        current.map((item) => (item.id === playlist.id ? (result.data as PlaylistSummary) : item)),
      );
    else setError(result.error);
  }
  async function remove(playlist: PlaylistSummary) {
    if (!window.confirm("Delete this playlist?")) return;
    const result = await deletePlaylist(token, playlist.id);
    if (result.error) setError(result.error);
    else setItems((current) => current.filter((item) => item.id !== playlist.id));
  }
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2>Your playlists</h2>
        <PlaylistDialog onCreate={create} />
      </div>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 ? (
        <p>No playlists yet.</p>
      ) : (
        <ul>
          {items.map((playlist) => (
            <li key={playlist.id}>
              <Link href={`/playlists/${playlist.id}`}>{playlist.name}</Link>{" "}
              <small>{playlist.itemCount} items</small>{" "}
              <button type="button" onClick={() => void rename(playlist)}>
                Rename
              </button>{" "}
              <button type="button" onClick={() => void remove(playlist)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
