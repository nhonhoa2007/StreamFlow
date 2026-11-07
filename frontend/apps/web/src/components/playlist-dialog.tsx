"use client";
import { useState } from "react";
export function PlaylistDialog({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)}>
        New playlist
      </button>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim()) {
          await onCreate(name.trim());
          setName("");
          setOpen(false);
        }
      }}
      style={{ display: "flex", gap: 8 }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Playlist name" />
      <button type="submit">Create</button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
