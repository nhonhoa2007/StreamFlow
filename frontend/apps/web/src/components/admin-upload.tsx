"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { completeUpload, initUpload } from "../lib/media-api";

export function AdminUpload({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  const { user, accessToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"VIDEO" | "AUDIO">("VIDEO");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!user || user.role !== "ADMIN") {
    return null;
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !accessToken) return;

    setError(null);
    setSuccess(null);
    setIsUploading(true);

    try {
      // 1. Init upload session
      setProgressStatus("Initializing upload session...");
      const initRes = await initUpload(accessToken, {
        filename: file.name,
        expectedSize: file.size,
        mimeType: file.type as
          | "video/mp4"
          | "video/webm"
          | "video/quicktime"
          | "audio/mpeg"
          | "audio/wav"
          | "audio/flac",
        type,
        title,
      });

      if (initRes.error || !initRes.data) {
        throw new Error(initRes.error || "Failed to initialize upload");
      }

      const { uploadId, presignedUrl } = initRes.data;

      // 2. Direct upload to storage via Presigned PUT
      setProgressStatus("Streaming file directly to Object Storage...");
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Direct storage upload failed");
      }

      // 3. Complete upload and register asset
      setProgressStatus("Verifying storage object and registering asset...");
      const completeRes = await completeUpload(accessToken, uploadId);

      if (completeRes.error || !completeRes.data) {
        throw new Error(completeRes.error || "Failed to complete upload");
      }

      setSuccess(`Upload successful! Registered asset for "${title}".`);
      setTitle("");
      setFile(null);
      setProgressStatus(null);
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: unknown) {
      setError((err as Error).message || "An unexpected error occurred during upload");
      setProgressStatus(null);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div style={{ marginBottom: "2rem" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: "0.5rem 1rem",
          backgroundColor: "#0f766e",
          color: "#ffffff",
          border: "none",
          borderRadius: "6px",
          fontWeight: 600,
          fontSize: "0.85rem",
          cursor: "pointer",
        }}
      >
        {isOpen ? "Close Uploader" : "Direct Media Upload (Admin)"}
      </button>

      {isOpen && (
        <div
          style={{
            marginTop: "1rem",
            padding: "1.5rem",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            maxWidth: "600px",
          }}
        >
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", color: "#0f172a" }}>
            Direct-to-Storage Media Uploader
          </h3>
          <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>
            Files upload directly into Object Storage via presigned URLs. Zero binary proxying
            through Node API memory.
          </p>

          {error && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                borderRadius: "4px",
                fontSize: "0.85rem",
                marginBottom: "1rem",
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "#f0fdf4",
                color: "#15803d",
                borderRadius: "4px",
                fontSize: "0.85rem",
                marginBottom: "1rem",
              }}
            >
              {success}
            </div>
          )}

          <form
            onSubmit={handleUpload}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div>
              <label
                htmlFor="media-title-input"
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: "#334155",
                  marginBottom: "0.25rem",
                }}
              >
                Media Title
              </label>
              <input
                id="media-title-input"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 4K Nature Showcase"
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="media-type-select"
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: "#334155",
                  marginBottom: "0.25rem",
                }}
              >
                Media Type
              </label>
              <select
                id="media-type-select"
                value={type}
                onChange={(e) => setType(e.target.value as "VIDEO" | "AUDIO")}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.9rem",
                }}
              >
                <option value="VIDEO">VIDEO (mp4, webm, quicktime)</option>
                <option value="AUDIO">AUDIO (mp3, wav, flac)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="media-file-input"
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: "#334155",
                  marginBottom: "0.25rem",
                }}
              >
                Media File (Max 5 GiB)
              </label>
              <input
                id="media-file-input"
                type="file"
                required
                accept={type === "VIDEO" ? "video/*" : "audio/*"}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{
                  fontSize: "0.85rem",
                  color: "#334155",
                }}
              />
            </div>

            {progressStatus && (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#0284c7" }}>
                ⏳ {progressStatus}
              </p>
            )}

            <button
              type="submit"
              disabled={isUploading}
              style={{
                padding: "0.75rem",
                backgroundColor: isUploading ? "#94a3b8" : "#0f766e",
                color: "#ffffff",
                border: "none",
                borderRadius: "4px",
                fontWeight: 600,
                cursor: isUploading ? "not-allowed" : "pointer",
              }}
            >
              {isUploading ? "Uploading..." : "Start Direct Upload"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
