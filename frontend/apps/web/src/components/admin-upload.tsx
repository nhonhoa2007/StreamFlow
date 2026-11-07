"use client";
import type { InitUploadRequest } from "@streamflow/contracts";
import { Check, CheckCircle2, FileAudio, Film, Loader2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { completeUpload, initUpload } from "../lib/media-api";
import { validateUploadFile } from "./admin-access";
export function AdminUpload({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  const { user, accessToken } = useAuth();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"VIDEO" | "AUDIO">("VIDEO");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  if (!user || user.role !== "ADMIN") return null;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !accessToken || uploading) return;
    const validation = validateUploadFile(file, type);
    if (validation) {
      setError(validation);
      return;
    }
    setUploading(true);
    setSuccess(false);
    setError("");
    setStage(1);
    try {
      const init = await initUpload(accessToken, {
        filename: file.name,
        title: title.trim(),
        type,
        mimeType: file.type as InitUploadRequest["mimeType"],
        expectedSize: file.size,
      });
      if (!init.data) throw new Error("We couldn't prepare your upload. Please try again.");
      setStage(2);
      abortRef.current = new AbortController();
      const response = await fetch(init.data.presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        signal: abortRef.current.signal,
      });
      if (!response.ok)
        throw new Error("Your file couldn't be uploaded. Check your connection and try again.");
      setStage(3);
      const result = await completeUpload(accessToken, init.data.uploadId);
      if (!result.data)
        throw new Error("Your file was received, but couldn't be verified. Please try again.");
      setStage(4);
      setSuccess(true);
      setFile(null);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      onUploadSuccess?.();
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError((caught as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <form onSubmit={submit} className="rounded-lg border border-white/10 bg-sf-surface p-6 sm:p-8">
      <div className="mb-7 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-sf-accent/10 text-sf-accent">
          <UploadCloud size={22} />
        </span>
        <div>
          <h2 className="font-semibold">Upload a new title</h2>
          <p className="mt-1 text-xs text-sf-text-muted">From your device to your collection.</p>
        </div>
      </div>
      {success && (
        <output className="mb-6 flex gap-3 rounded-lg border border-white/20 bg-white/5 p-4 text-sm text-sf-text-primary">
          <CheckCircle2 size={19} className="shrink-0" />
          <p>
            File received and saved as a draft. It will appear in the collection after processing
            and publication.
          </p>
        </output>
      )}
      {error && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200"
        >
          {error}
        </p>
      )}
      <fieldset disabled={uploading} className="space-y-6 disabled:opacity-60">
        <div>
          <label
            htmlFor="media-title-input"
            className="mb-2 block text-xs font-semibold text-sf-text-secondary"
          >
            Title
          </label>
          <input
            id="media-title-input"
            required
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give your story a name"
            className="h-12 w-full rounded-lg border border-white/10 bg-sf-base px-4 text-sm placeholder:text-sf-text-muted"
          />
        </div>
        <div>
          <span className="mb-2 block text-xs font-semibold text-sf-text-secondary">
            Media type
          </span>
          <div className="flex gap-3">
            {(["VIDEO", "AUDIO"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setType(value);
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                aria-pressed={type === value}
                className="pill"
              >
                {value === "VIDEO" ? <Film size={16} /> : <FileAudio size={16} />}
                {value === "VIDEO" ? "Video" : "Audio"}
              </button>
            ))}
          </div>
        </div>
        <div className="relative rounded-lg border border-dashed border-white/20 bg-sf-base/50 p-7 text-center">
          <UploadCloud size={27} className="mx-auto mb-3 text-sf-text-muted" />
          <label htmlFor="media-file-input" className="mb-1 block text-sm font-medium">
            {file ? file.name : "Choose your original file"}
          </label>
          <p className="mb-4 text-xs text-sf-text-muted">
            {file
              ? `${(file.size / 1024 ** 2).toFixed(1)} MB`
              : `Up to 5 GiB · ${type === "VIDEO" ? "MP4, WebM, QuickTime" : "MP3, WAV, FLAC"}`}
          </p>
          <input
            id="media-file-input"
            ref={fileRef}
            type="file"
            required
            accept={
              type === "VIDEO"
                ? "video/mp4,video/webm,video/quicktime"
                : "audio/mpeg,audio/wav,audio/flac"
            }
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="max-w-full text-xs text-sf-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-3 file:text-xs file:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={!file || !title.trim() || uploading}
          className="button-primary w-full disabled:opacity-40"
        >
          {uploading ? <Loader2 size={17} className="animate-spin" /> : <UploadCloud size={17} />}
          {uploading ? "Uploading your title…" : "Upload title"}
        </button>
      </fieldset>
      {(uploading || success) && (
        <ol
          aria-live="polite"
          className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-6"
        >
          {["Prepare", "Upload", "Verify"].map((label, index) => (
            <li key={label} className="flex items-center gap-2 text-xs text-sf-text-muted">
              {stage > index + 1 ? (
                <Check size={14} className="text-sf-text-primary" />
              ) : (
                <span
                  className={
                    stage === index + 1
                      ? "h-2 w-2 rounded-full bg-sf-accent animate-pulse"
                      : "h-2 w-2 rounded-full bg-white/15"
                  }
                />
              )}
              {label}
            </li>
          ))}
        </ol>
      )}
    </form>
  );
}
