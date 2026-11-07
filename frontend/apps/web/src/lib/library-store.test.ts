import { describe, expect, it } from "vitest";
import { LibraryStore } from "./library-store";
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const item = (id: string) => ({
  mediaId: id,
  createdAt: "today",
  media: {
    id,
    type: "VIDEO" as const,
    title: id,
    slug: id,
    durationMs: 0,
    classificationLabels: [],
  },
});
describe("concurrent library mutations", () => {
  it("reconciles both saves when a refetch finishes between two mutations", async () => {
    const server = new Set<string>();
    const a = deferred<boolean>();
    const b = deferred<boolean>();
    const store = new LibraryStore({
      fetch: async () => ({ items: [...server].map(item) }),
      mutate: (id) => (id === "a" ? a.promise : b.promise),
    });
    const first = store.toggle("a");
    const second = store.toggle("b");
    expect([...store.getSnapshot().savedIds]).toEqual(["a", "b"]);
    server.add("a");
    a.resolve(true);
    await first;
    await store.refresh();
    expect(store.getSnapshot().savedIds.has("b")).toBe(true);
    server.add("b");
    b.resolve(true);
    await second;
    await store.refresh();
    expect([...store.getSnapshot().savedIds].sort()).toEqual(["a", "b"]);
    expect(
      store
        .getSnapshot()
        .favorites.map((x) => x.mediaId)
        .sort(),
    ).toEqual(["a", "b"]);
  });
  it("rolls back a failed save without discarding another in-flight save", async () => {
    const a = deferred<boolean>();
    const b = deferred<boolean>();
    const store = new LibraryStore({
      fetch: async () => ({ items: [] }),
      mutate: (id) => (id === "a" ? a.promise : b.promise),
    });
    const first = store.toggle("a");
    const second = store.toggle("b");
    a.resolve(false);
    await first;
    expect(store.getSnapshot().savedIds.has("a")).toBe(false);
    expect(store.getSnapshot().savedIds.has("b")).toBe(true);
    expect(store.getSnapshot().error).toMatch(/could not/i);
    b.resolve(false);
    await second;
  });
});
