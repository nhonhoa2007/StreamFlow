import type { PaginatedMediaResponse } from "@streamflow/contracts";
import type { FetchMediaResult } from "./media-api";

export interface InfiniteMediaSnapshot extends PaginatedMediaResponse {
  loading: boolean;
  error: string | null;
}
export type LoadMediaPage = (cursor: string, signal: AbortSignal) => Promise<FetchMediaResult>;
const loadError = "We couldn't load more titles. Please try again.";

export class InfiniteMediaStore {
  private snapshot: InfiniteMediaSnapshot;
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private generation = 0;
  private disposed = false;
  private completedCursors = new Set<string>();
  constructor(
    initial: PaginatedMediaResponse,
    private readonly loadPage: LoadMediaPage,
  ) {
    this.snapshot = { ...initial, loading: false, error: null };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(next: Partial<InfiniteMediaSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }
  activate = () => {
    this.disposed = false;
  };
  dispose = () => {
    this.disposed = true;
    this.generation++;
    this.controller?.abort();
    this.snapshot = { ...this.snapshot, loading: false };
  };
  loadNext = async (retry = false): Promise<void> => {
    const { nextCursor, hasMore, loading, error } = this.snapshot;
    if (this.disposed || loading || !hasMore || (error && !retry)) return;
    if (!nextCursor) {
      this.update({ error: loadError });
      return;
    }
    const request = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.update({ loading: true, error: null });
    try {
      const result = await this.loadPage(nextCursor, controller.signal);
      if (this.disposed || request !== this.generation) return;
      const page = result.data;
      if (
        !page ||
        (page.hasMore &&
          (!page.nextCursor ||
            page.nextCursor === nextCursor ||
            this.completedCursors.has(page.nextCursor)))
      ) {
        this.update({ error: loadError });
        return;
      }
      this.completedCursors.add(nextCursor);
      const ids = new Set(this.snapshot.items.map((item) => item.id));
      const additions = page.items.filter((item) => {
        if (ids.has(item.id)) return false;
        ids.add(item.id);
        return true;
      });
      this.update({
        items: [...this.snapshot.items, ...additions],
        nextCursor: page.hasMore ? page.nextCursor : null,
        hasMore: page.hasMore,
      });
    } catch {
      if (!this.disposed && request === this.generation && !controller.signal.aborted)
        this.update({ error: loadError });
    } finally {
      if (!this.disposed && request === this.generation) this.update({ loading: false });
    }
  };
}
