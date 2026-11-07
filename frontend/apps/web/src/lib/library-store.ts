import type { FavoriteItem } from "@streamflow/contracts";
interface LibrarySnapshot {
  favorites: FavoriteItem[];
  savedIds: Set<string>;
  pendingIds: Set<string>;
  loading: boolean;
  error: string;
}
interface LibraryDependencies {
  fetch: () => Promise<{ items: FavoriteItem[]; error?: string }>;
  mutate: (id: string, wasSaved: boolean) => Promise<boolean>;
}
export class LibraryStore {
  private snapshot: LibrarySnapshot = {
    favorites: [],
    savedIds: new Set(),
    pendingIds: new Set(),
    loading: false,
    error: "",
  };
  private listeners = new Set<() => void>();
  private optimistic = new Map<string, boolean>();
  private readGeneration = 0;
  private disposed = false;
  constructor(private readonly dependencies: LibraryDependencies) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(next: Partial<LibrarySnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }
  activate = () => {
    this.disposed = false;
    void this.refresh();
  };
  dispose = () => {
    this.disposed = true;
    this.readGeneration++;
  };
  refresh = async () => {
    const generation = ++this.readGeneration;
    this.update({ loading: true });
    const result = await this.dependencies.fetch();
    if (this.disposed || generation !== this.readGeneration) return;
    const savedIds = new Set(result.items.map((item) => item.mediaId));
    for (const [id, value] of this.optimistic) {
      if (value) savedIds.add(id);
      else savedIds.delete(id);
    }
    this.update({
      favorites: result.items,
      savedIds,
      loading: false,
      ...(result.error ? { error: result.error } : {}),
    });
  };
  toggle = async (id: string) => {
    if (this.optimistic.has(id)) return;
    const before = this.snapshot.savedIds.has(id);
    this.optimistic.set(id, !before);
    const savedIds = new Set(this.snapshot.savedIds);
    if (before) savedIds.delete(id);
    else savedIds.add(id);
    this.update({ savedIds, pendingIds: new Set(this.optimistic.keys()), error: "" });
    const actual = await this.dependencies.mutate(id, before);
    if (this.disposed) return;
    this.optimistic.delete(id);
    const next = new Set(this.snapshot.savedIds);
    if (actual) next.add(id);
    else next.delete(id);
    this.update({
      savedIds: next,
      pendingIds: new Set(this.optimistic.keys()),
      error: actual === before ? "Your library could not be updated. Please try again." : "",
    });
    await this.refresh();
  };
}
