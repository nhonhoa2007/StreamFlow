"use client";
import type { AdminMediaRecord, AdminUpdateMedia } from "@streamflow/contracts";
import { useEffect, useState } from "react";
export function AdminMediaEditor({
  media,
  saving,
  onSave,
  onCancel,
}: {
  media: AdminMediaRecord;
  saving?: boolean;
  onSave: (payload: AdminUpdateMedia) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(media.title);
  const [slug, setSlug] = useState(media.slug);
  const [status, setStatus] = useState(media.status);
  const [durationMs, setDurationMs] = useState(media.durationMs?.toString() ?? "");
  const [albumId, setAlbumId] = useState(media.albumId ?? "");
  useEffect(() => {
    setTitle(media.title);
    setSlug(media.slug);
    setStatus(media.status);
    setDurationMs(media.durationMs?.toString() ?? "");
    setAlbumId(media.albumId ?? "");
  }, [media]);
  return (
    <form
      className="space-y-4 rounded-lg border border-white/10 bg-sf-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          title: title.trim(),
          slug: slug.trim(),
          status,
          ...(durationMs ? { durationMs: Number(durationMs) } : {}),
          ...(albumId ? { albumId } : {}),
        });
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Edit media</h3>
        <button type="button" onClick={onCancel} className="text-xs text-sf-text-muted">
          Close
        </button>
      </div>
      <label className="block text-xs text-sf-text-secondary">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={255}
          className="mt-1 h-10 w-full rounded border border-white/10 bg-sf-base px-3 text-sm"
        />
      </label>
      <label className="block text-xs text-sf-text-secondary">
        Slug
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          maxLength={255}
          className="mt-1 h-10 w-full rounded border border-white/10 bg-sf-base px-3 text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-sf-text-secondary">
          Duration (ms)
          <input
            type="number"
            min="0"
            value={durationMs}
            onChange={(e) => setDurationMs(e.target.value)}
            className="mt-1 h-10 w-full rounded border border-white/10 bg-sf-base px-3 text-sm"
          />
        </label>
        <label className="block text-xs text-sf-text-secondary">
          Visibility
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="mt-1 h-10 w-full rounded border border-white/10 bg-sf-base px-3 text-sm"
          >
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready / public</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-sf-text-secondary">
        Album ID (optional)
        <input
          value={albumId}
          onChange={(e) => setAlbumId(e.target.value)}
          placeholder="Album UUID"
          className="mt-1 h-10 w-full rounded border border-white/10 bg-sf-base px-3 text-sm"
        />
      </label>
      <button type="submit" disabled={saving} className="button-primary w-full">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
