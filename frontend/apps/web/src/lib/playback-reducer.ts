import type { MediaItem } from "@streamflow/contracts";

export interface PlaybackState {
  currentItem: MediaItem | null;
  sessionId: string | null;
  sessionPending: boolean;
  positionMs: number;
  queue: MediaItem[];
  status: "idle" | "loading" | "playing" | "paused" | "error";
  error: string | null;
  expanded: boolean;
  revision: number;
}
export const initialPlaybackState: PlaybackState = {
  currentItem: null,
  sessionId: null,
  sessionPending: false,
  positionMs: 0,
  queue: [],
  status: "idle",
  error: null,
  expanded: false,
  revision: 0,
};
export type PlaybackAction =
  | { type: "PLAY"; item: MediaItem; positionMs?: number; sessionPending?: boolean }
  | { type: "SESSION"; mediaId: string; sessionId: string; positionMs: number }
  | { type: "SESSION_UNAVAILABLE"; mediaId: string }
  | { type: "ENQUEUE"; item: MediaItem }
  | { type: "REMOVE"; mediaId: string }
  | { type: "PROGRESS"; positionMs: number }
  | { type: "STATUS"; status: PlaybackState["status"] }
  | { type: "EXPAND"; expanded: boolean }
  | { type: "ERROR"; error: string; mediaId?: string }
  | { type: "RETRY" }
  | { type: "CLOSE" };
export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case "PLAY":
      return {
        ...state,
        currentItem: action.item,
        sessionPending: action.sessionPending ?? false,
        sessionId: null,
        positionMs: action.positionMs ?? 0,
        status: "loading",
        error: null,
        expanded: true,
        queue: state.queue.filter((item) => item.id !== action.item.id),
        revision: state.revision + 1,
      };
    case "SESSION":
      return state.currentItem?.id !== action.mediaId
        ? state
        : {
            ...state,
            sessionId: action.sessionId,
            sessionPending: false,
            positionMs: action.positionMs,
          };
    case "SESSION_UNAVAILABLE":
      return state.currentItem?.id !== action.mediaId ? state : { ...state, sessionPending: false };
    case "ENQUEUE":
      return state.currentItem?.id === action.item.id ||
        state.queue.some((item) => item.id === action.item.id)
        ? state
        : { ...state, queue: [...state.queue, action.item] };
    case "REMOVE":
      return { ...state, queue: state.queue.filter((item) => item.id !== action.mediaId) };
    case "PROGRESS":
      return { ...state, positionMs: Math.max(0, action.positionMs) };
    case "STATUS":
      return { ...state, status: action.status };
    case "EXPAND":
      return { ...state, expanded: action.expanded };
    case "ERROR":
      return action.mediaId && state.currentItem?.id !== action.mediaId
        ? state
        : { ...state, status: "error", error: action.error };
    case "RETRY":
      return { ...state, status: "loading", error: null, revision: state.revision + 1 };
    case "CLOSE":
      return { ...initialPlaybackState, queue: state.queue, revision: state.revision + 1 };
  }
}
