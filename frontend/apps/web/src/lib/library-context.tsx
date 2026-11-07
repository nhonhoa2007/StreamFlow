"use client";
import type { FavoriteItem } from "@streamflow/contracts";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useAuth } from "./auth-context";
import { LibraryStore } from "./library-store";
import { fetchFavorites, toggleFavorite } from "./media-api";
const LibraryContext = createContext<{
  favorites: FavoriteItem[];
  savedIds: Set<string>;
  pendingIds: Set<string>;
  loading: boolean;
  error: string;
  toggle: (id: string) => Promise<void>;
  refresh: () => void;
} | null>(null);
export function LibraryProvider({ children }: { children: ReactNode }) {
  const { accessToken, openAuthModal } = useAuth();
  const store = useMemo(
    () =>
      new LibraryStore({
        fetch: () => (accessToken ? fetchFavorites(accessToken) : Promise.resolve({ items: [] })),
        mutate: (id, before) =>
          accessToken ? toggleFavorite(accessToken, id, before) : Promise.resolve(before),
      }),
    [accessToken],
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.activate();
    return store.dispose;
  }, [store]);
  const toggle = async (id: string) => {
    if (!accessToken) {
      openAuthModal();
      return;
    }
    await store.toggle(id);
  };
  return (
    <LibraryContext.Provider
      value={{
        ...state,
        toggle,
        refresh: () => {
          void store.refresh();
        },
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}
export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary requires LibraryProvider");
  return context;
}
