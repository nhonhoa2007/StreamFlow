"use client";
import type { MediaItem } from "@streamflow/contracts";
import { AudioLines, Film, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { fetchMedia, searchMedia } from "../lib/media-api";

import {
  type ClassificationFilter,
  type MediaFilter,
  type SearchSort,
  searchHref,
} from "../lib/search-state";
import { FeedbackState } from "./feedback-state";
import { InfiniteMediaGrid } from "./infinite-media-grid";
export function SearchSurface({
  query,
  type,
  classification,
  items,
  error,
  nextCursor = null,
  hasMore = false,
  sort,
  minDurationMs,
  maxDurationMs,
  publishedAfter,
  publishedBefore,
}: {
  query: string;
  type?: MediaFilter;
  classification?: ClassificationFilter;
  items: MediaItem[];
  error?: string;
  nextCursor?: string | null;
  hasMore?: boolean;
  sort?: SearchSort;
  minDurationMs?: number;
  maxDurationMs?: number;
  publishedAfter?: string;
  publishedBefore?: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState(query);
  const [classificationInput, setClassificationInput] = useState(classification ?? "");
  const [sortInput, setSortInput] = useState<SearchSort>(sort ?? "recent");
  const [minDurationInput, setMinDurationInput] = useState(
    minDurationMs ? String(minDurationMs / 60000) : "",
  );
  const [maxDurationInput, setMaxDurationInput] = useState(
    maxDurationMs ? String(maxDurationMs / 60000) : "",
  );
  const [publishedAfterInput, setPublishedAfterInput] = useState(publishedAfter ?? "");
  const [publishedBeforeInput, setPublishedBeforeInput] = useState(publishedBefore ?? "");
  const classificationOptions = Array.from(
    new Set(items.flatMap((item) => item.classificationLabels ?? [])),
  ).sort();
  if (classification && !classificationOptions.includes(classification)) {
    classificationOptions.unshift(classification);
  }
  const submitted = useRef(new Set<string>());
  const [pending, startTransition] = useTransition();
  const [loadedCount, setLoadedCount] = useState(items.length);
  useEffect(() => {
    const key =
      query +
      (type ?? "") +
      (classification ?? "") +
      (sort ?? "recent") +
      (minDurationMs ?? "") +
      (maxDurationMs ?? "");
    if (submitted.current.has(key)) submitted.current.delete(key);
    else {
      setInput(query);
      setClassificationInput(classification ?? "");
      setSortInput(sort ?? "recent");
      setMinDurationInput(minDurationMs ? String(minDurationMs / 60000) : "");
      setMaxDurationInput(maxDurationMs ? String(maxDurationMs / 60000) : "");
      setPublishedAfterInput(publishedAfter ?? "");
      setPublishedBeforeInput(publishedBefore ?? "");
    }
  }, [
    query,
    type,
    classification,
    sort,
    minDurationMs,
    maxDurationMs,
    publishedAfter,
    publishedBefore,
  ]);
  useEffect(() => {
    if (
      input.trim() === query &&
      classificationInput === (classification ?? "") &&
      sortInput === (sort ?? "recent") &&
      (Number(minDurationInput || 0) * 60000 || undefined) === minDurationMs &&
      (Number(maxDurationInput || 0) * 60000 || undefined) === maxDurationMs &&
      publishedAfterInput === (publishedAfter ?? "") &&
      publishedBeforeInput === (publishedBefore ?? "")
    )
      return;
    const timer = setTimeout(
      () =>
        startTransition(() => {
          submitted.current.add(input.trim() + (type ?? "") + classificationInput);
          router.replace(
            searchHref(
              input,
              type,
              classificationInput,
              sortInput,
              Number(minDurationInput || 0) * 60000 || undefined,
              Number(maxDurationInput || 0) * 60000 || undefined,
              publishedAfterInput || undefined,
              publishedBeforeInput || undefined,
            ),
            { scroll: false },
          );
        }),
      450,
    );
    return () => clearTimeout(timer);
  }, [
    classification,
    classificationInput,
    input,
    query,
    type,
    router,
    sortInput,
    minDurationInput,
    maxDurationInput,
    sort,
    minDurationMs,
    maxDurationMs,
    publishedAfter,
    publishedBefore,
    publishedAfterInput,
    publishedBeforeInput,
  ]);
  return (
    <div className="page-content">
      <h1 className="page-title mb-7">Search</h1>
      <form
        className="relative mb-5 max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(() =>
            router.push(
              searchHref(
                input,
                type,
                classificationInput,
                sortInput,
                Number(minDurationInput || 0) * 60000 || undefined,
                Number(maxDurationInput || 0) * 60000 || undefined,
                publishedAfterInput || undefined,
                publishedBeforeInput || undefined,
              ),
            ),
          );
        }}
      >
        <Search size={21} className="absolute left-5 top-5 text-sf-text-muted" />
        <input
          aria-label="Search the collection"
          type="search"
          maxLength={100}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="What are you in the mood for?"
          className="h-16 w-full rounded-lg border border-white/15 bg-sf-surface pl-14 pr-14 text-base text-white placeholder:text-sf-text-muted"
        />
        {input && (
          <button
            type="button"
            onClick={() => setInput("")}
            aria-label="Clear search"
            className="icon-button absolute right-2 top-2"
          >
            <X size={18} />
          </button>
        )}
      </form>
      <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-xs text-sf-text-muted">
            <span>Classification</span>
            <select
              aria-label="Classification filter"
              value={classificationInput}
              onChange={(event) => setClassificationInput(event.target.value)}
              className="h-9 w-40 rounded-md border border-white/15 bg-sf-surface px-3 text-xs text-white placeholder:text-sf-text-muted"
            >
              <option value="">All labels</option>
              {classificationOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-sf-text-muted">
            <span>Sort</span>
            <select
              aria-label="Sort results"
              value={sortInput}
              onChange={(e) => setSortInput(e.target.value as SearchSort)}
              className="h-9 rounded-md border border-white/15 bg-sf-surface px-3 text-xs text-white"
            >
              <option value="recent">Recent</option>
              <option value="title_asc">Title A–Z</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-sf-text-muted">
            <span>Min minutes</span>
            <input
              aria-label="Minimum duration"
              inputMode="numeric"
              value={minDurationInput}
              onChange={(e) => setMinDurationInput(e.target.value.replace(/\D/g, ""))}
              className="h-9 w-20 rounded-md border border-white/15 bg-sf-surface px-2 text-xs text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-sf-text-muted">
            <span>Max minutes</span>
            <input
              aria-label="Maximum duration"
              inputMode="numeric"
              value={maxDurationInput}
              onChange={(e) => setMaxDurationInput(e.target.value.replace(/\D/g, ""))}
              className="h-9 w-20 rounded-md border border-white/15 bg-sf-surface px-2 text-xs text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-sf-text-muted">
            <span>Published after</span>
            <input
              aria-label="Published after"
              type="date"
              value={publishedAfterInput}
              onChange={(e) => setPublishedAfterInput(e.target.value)}
              className="h-9 rounded-md border border-white/15 bg-sf-surface px-2 text-xs text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-sf-text-muted">
            <span>Published before</span>
            <input
              aria-label="Published before"
              type="date"
              value={publishedBeforeInput}
              onChange={(e) => setPublishedBeforeInput(e.target.value)}
              className="h-9 rounded-md border border-white/15 bg-sf-surface px-2 text-xs text-white"
            />
          </label>
          <Link
            href={searchHref(
              query,
              undefined,
              classification,
              sort,
              minDurationMs,
              maxDurationMs,
              publishedAfter,
              publishedBefore,
            )}
            className="pill"
            aria-current={!type ? "page" : undefined}
          >
            Everything
          </Link>
          <Link
            href={searchHref(
              query,
              "VIDEO",
              classification,
              sort,
              minDurationMs,
              maxDurationMs,
              publishedAfter,
              publishedBefore,
            )}
            className="pill"
            aria-current={type === "VIDEO" ? "page" : undefined}
          >
            <Film size={14} />
            Films
          </Link>
          <Link
            href={searchHref(
              query,
              "AUDIO",
              classification,
              sort,
              minDurationMs,
              maxDurationMs,
              publishedAfter,
              publishedBefore,
            )}
            className="pill"
            aria-current={type === "AUDIO" ? "page" : undefined}
          >
            <AudioLines size={14} />
            Audio
          </Link>
        </div>
        <p aria-live="polite" className="text-xs text-sf-text-muted">
          {pending
            ? "Searching…"
            : query
              ? `${items.length ? loadedCount : 0} titles loaded`
              : "Explore the collection"}
        </p>
      </div>
      {error ? (
        <FeedbackState
          kind="error"
          title="Search is taking a moment"
          message="Please check your connection and try again."
          action={
            <button type="button" onClick={() => router.refresh()} className="button-secondary">
              Try again
            </button>
          }
        />
      ) : items.length === 0 ? (
        <FeedbackState
          kind="empty"
          title={query ? `No titles found for “${query}”` : "New discoveries are on their way"}
          message="Try a different title or explore another collection."
          action={
            <Link href="/search" className="button-secondary">
              Explore all titles
            </Link>
          }
        />
      ) : (
        <div className={pending ? "opacity-50" : ""} aria-busy={pending}>
          <InfiniteMediaGrid
            key={JSON.stringify({
              query,
              type,
              classification,
              sort,
              minDurationMs,
              maxDurationMs,
              items,
              nextCursor,
              hasMore,
            })}
            initial={{ items, nextCursor, hasMore }}
            enabled={!pending}
            onCountChange={setLoadedCount}
            loadPage={(cursor, signal) =>
              query
                ? searchMedia(query, type, undefined, {
                    classification,
                    cursor,
                    limit: 20,
                    sort,
                    minDurationMs,
                    maxDurationMs,
                    publishedAfter,
                    publishedBefore,
                    signal,
                  })
                : fetchMedia(undefined, {
                    type,
                    classification,
                    cursor,
                    limit: 20,
                    signal,
                    sort,
                    minDurationMs,
                    maxDurationMs,
                    publishedAfter,
                    publishedBefore,
                  })
            }
          />
        </div>
      )}
    </div>
  );
}
