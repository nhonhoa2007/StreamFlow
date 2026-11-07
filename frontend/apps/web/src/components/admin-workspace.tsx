"use client";
import type { AdminMediaRecord, TranscodeJobStatusResponse } from "@streamflow/contracts";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  deleteAdminMedia,
  fetchAdminMedia,
  fetchAdminTranscodeJobs,
  triggerAdminTranscode,
  updateAdminMedia,
} from "../lib/admin-api";
import { useAuth } from "../lib/auth-context";
import { getAdminAccess } from "./admin-access";
import { AdminMediaEditor } from "./admin-media-editor";
import { AdminMediaTable } from "./admin-media-table";
import { AdminUpload } from "./admin-upload";
import { FeedbackState } from "./feedback-state";

export function AdminWorkspace() {
  const { user, accessToken, isLoading, openAuthModal } = useAuth();
  const access = getAdminAccess(user, isLoading);
  const [items, setItems] = useState<AdminMediaRecord[]>([]);
  const [jobs, setJobs] = useState<Record<string, TranscodeJobStatusResponse | undefined>>({});
  const [selected, setSelected] = useState<AdminMediaRecord>();
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryingId, setRetryingId] = useState<string>();
  const refresh = useCallback(async () => {
    if (!accessToken || user?.role !== "ADMIN") return;
    const result = await fetchAdminMedia(accessToken);
    if (!result.data) {
      setError(result.error ?? "Unable to load media inventory.");
      return;
    }
    setItems(result.data);
    setError("");
    await Promise.all(
      result.data.map(async (item) => {
        const response = await fetchAdminTranscodeJobs(accessToken, item.id);
        if (response.data?.[0])
          setJobs((current) => ({ ...current, [item.id]: response.data?.[0] }));
      }),
    );
  }, [accessToken, user?.role]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!accessToken) return;
    const active = Object.entries(jobs).filter(
      ([, job]) => job?.status === "QUEUED" || job?.status === "PROCESSING",
    );
    if (active.length === 0) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void Promise.all(
        active.map(async ([mediaId]) => {
          const response = await fetchAdminTranscodeJobs(accessToken, mediaId);
          if (!controller.signal.aborted && response.data?.[0])
            setJobs((current) => ({ ...current, [mediaId]: response.data?.[0] }));
        }),
      );
    }, 2500);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [accessToken, jobs]);
  async function save(payload: Parameters<typeof updateAdminMedia>[2]) {
    if (!accessToken || !selected) return;
    setSaving(true);
    const result = await updateAdminMedia(accessToken, selected.id, payload);
    setSaving(false);
    if (result.data) {
      setItems((current) =>
        current.map((item) =>
          item.id === result.data?.id ? (result.data as AdminMediaRecord) : item,
        ),
      );
      setSelected(undefined);
    } else setError(result.error ?? "Unable to save changes.");
  }
  async function remove(item: AdminMediaRecord) {
    if (
      !accessToken ||
      !window.confirm(`Delete “${item.title}”? It will disappear from the public catalog.`)
    )
      return;
    const result = await deleteAdminMedia(accessToken, item.id);
    if (result.data) setItems((current) => current.filter((entry) => entry.id !== item.id));
    else setError(result.error ?? "Unable to delete media.");
  }
  async function transcode(item: AdminMediaRecord) {
    if (!accessToken) return;
    setRetryingId(item.id);
    const result = await triggerAdminTranscode(accessToken, item.id);
    setRetryingId(undefined);
    if (result.data) {
      const status = await fetchAdminTranscodeJobs(accessToken, item.id);
      setJobs((current) => ({ ...current, [item.id]: status.data?.[0] }));
    } else setError(result.error ?? "Unable to queue transcode.");
  }
  return (
    <div className="page-content">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 py-2 text-xs text-sf-text-secondary"
      >
        <ArrowLeft size={15} /> Back to discover
      </Link>
      <p className="eyebrow mb-3">StreamFlow Studio</p>
      <h1 className="page-title">Make room for your story.</h1>
      <p className="mb-10 mt-4 text-sm text-sf-text-muted">
        Add, review, and publish titles in your collection.
      </p>
      {access === "loading" ? (
        <FeedbackState kind="loading" title="Opening your workspace" />
      ) : access !== "allowed" ? (
        <FeedbackState
          kind="empty"
          title={
            access === "sign-in" ? "Sign in to open Studio" : "This space is for administrators"
          }
          message="An administrator account is required to upload and manage titles."
          action={
            access === "sign-in" ? (
              <button type="button" onClick={openAuthModal} className="button-primary">
                Sign in
              </button>
            ) : (
              <Link href="/" className="button-secondary">
                Back to Home
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="mb-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
            <AdminUpload onUploadSuccess={refresh} />
            <aside className="rounded-lg border border-white/10 bg-sf-surface p-6">
              <ShieldCheck size={24} className="mb-5 text-sf-accent" />
              <h2 className="font-semibold">A thoughtful collection.</h2>
              <p className="mt-3 text-xs leading-6 text-sf-text-muted">
                Files are saved as drafts before publication. Review each title before making it
                public.
              </p>
            </aside>
          </div>
          {error && (
            <p
              role="alert"
              className="mb-5 rounded border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200"
            >
              {error}
            </p>
          )}
          {selected && (
            <div className="mb-6">
              <AdminMediaEditor
                media={selected}
                saving={saving}
                onSave={save}
                onCancel={() => setSelected(undefined)}
              />
            </div>
          )}
          <AdminMediaTable
            items={items}
            jobs={jobs}
            filter={filter}
            onFilter={setFilter}
            onEdit={setSelected}
            onDelete={remove}
            onTranscode={transcode}
            retryingId={retryingId}
          />
        </>
      )}
    </div>
  );
}
