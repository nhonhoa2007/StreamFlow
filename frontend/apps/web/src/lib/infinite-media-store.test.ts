import type { MediaItem, PaginatedMediaResponse } from "@streamflow/contracts";
import { describe, expect, it } from "vitest";
import { InfiniteMediaStore } from "./infinite-media-store";
const item = (id: string): MediaItem => ({
  id,
  title: id,
  type: "VIDEO",
  slug: id,
  durationMs: 1000,
  classificationLabels: [],
});
const initial = { items: [item("a")], nextCursor: "page-2", hasMore: true };
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("infinite media loading", () => {
  it("loads one next page for concurrent triggers and appends each ID once", async () => {
    const response = deferred<{ data: PaginatedMediaResponse }>();
    const requested: string[] = [];
    const store = new InfiniteMediaStore(initial, async (cursor) => {
      requested.push(cursor);
      return response.promise;
    });
    const first = store.loadNext();
    const second = store.loadNext();
    expect(store.getSnapshot().loading).toBe(true);
    response.resolve({
      data: { items: [item("a"), item("b"), item("b")], nextCursor: null, hasMore: false },
    });
    await Promise.all([first, second]);
    expect(requested).toEqual(["page-2"]);
    expect(store.getSnapshot().items.map((item) => item.id)).toEqual(["a", "b"]);
    await store.loadNext();
    expect(requested).toEqual(["page-2"]);
  });
  it("pauses automatic requests after an error and retries the same cursor explicitly", async () => {
    let attempts = 0;
    const cursors: string[] = [];
    const store = new InfiniteMediaStore(initial, async (cursor) => {
      cursors.push(cursor);
      return ++attempts === 1
        ? { error: "offline" }
        : { data: { items: [item("b")], nextCursor: null, hasMore: false } };
    });
    await store.loadNext();
    await store.loadNext();
    expect(attempts).toBe(1);
    expect(store.getSnapshot().items.map((item) => item.id)).toEqual(["a"]);
    expect(store.getSnapshot().error).toBeTruthy();
    await store.loadNext(true);
    expect(cursors).toEqual(["page-2", "page-2"]);
    expect(store.getSnapshot().items.map((item) => item.id)).toEqual(["a", "b"]);
  });
  it("aborts a request when the list unmounts and ignores its late response", async () => {
    const response = deferred<{ data: PaginatedMediaResponse }>();
    let signal: AbortSignal | undefined;
    const store = new InfiniteMediaStore(initial, async (_cursor, requestSignal) => {
      signal = requestSignal;
      return response.promise;
    });
    const request = store.loadNext();
    store.dispose();
    expect(signal?.aborted).toBe(true);
    response.resolve({ data: { items: [item("old")], nextCursor: null, hasMore: false } });
    await request;
    expect(store.getSnapshot().items.map((item) => item.id)).toEqual(["a"]);
  });
  it("does not loop when the server returns a missing or repeated next cursor", async () => {
    const store = new InfiniteMediaStore(initial, async () => ({
      data: { items: [], nextCursor: "page-2", hasMore: true },
    }));
    await store.loadNext();
    expect(store.getSnapshot().error).toBeTruthy();
    expect(store.getSnapshot().loading).toBe(false);
  });
  it("does not request anything when the initial page is already the last page", async () => {
    let requested = false;
    const store = new InfiniteMediaStore(
      { items: [], nextCursor: null, hasMore: false },
      async () => {
        requested = true;
        return { error: "Unexpected" };
      },
    );
    await store.loadNext();
    expect(requested).toBe(false);
  });
});

it("pauses if a later page points back to an already loaded cursor", async () => {
  let calls = 0;
  const store = new InfiniteMediaStore(initial, async () => ({
    data: {
      items: [item(`b${calls}`)],
      nextCursor: ++calls === 1 ? "page-3" : "page-2",
      hasMore: true,
    },
  }));
  await store.loadNext();
  await store.loadNext();
  expect(store.getSnapshot().error).toBeTruthy();
  await store.loadNext();
  expect(calls).toBe(2);
});
