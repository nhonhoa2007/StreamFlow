"use client";

import type { MediaItem } from "@streamflow/contracts";
import {
  type Dispatch,
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useReducer,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth-context";
import { startPlayback } from "./media-api";
import {
  type PlaybackAction,
  type PlaybackState,
  initialPlaybackState,
  playbackReducer,
} from "./playback-reducer";

type PlaybackContextValue = {
  state: PlaybackState;
  dispatch: Dispatch<PlaybackAction>;
  mediaRef: RefObject<HTMLVideoElement | null>;
  flushRef: RefObject<(() => void) | null>;
  play: (item: MediaItem, positionMs?: number) => Promise<void>;
  resume: (item: MediaItem, positionMs: number) => Promise<void>;
  enqueue: (item: MediaItem) => void;
  removeFromQueue: (mediaId: string) => void;
  playNext: () => void;
  close: () => void;
  retry: () => void;
  togglePlayback: () => void;
  notice: string;
  setNotice: (notice: string) => void;
};
const PlaybackContext = createContext<PlaybackContextValue | null>(null);
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playbackReducer, initialPlaybackState);
  const [notice, setNotice] = useState("");
  const { accessToken } = useAuth();
  const mediaRef = useRef<HTMLVideoElement>(null);
  const flushRef = useRef<(() => void) | null>(null);
  const requestId = useRef(0);

  const play = useCallback(
    async (item: MediaItem, positionMs?: number) => {
      flushRef.current?.();
      const request = ++requestId.current;
      dispatch({ type: "PLAY", item, positionMs, sessionPending: Boolean(accessToken) });
      setNotice("");
      if (accessToken) {
        const result = await startPlayback(accessToken, item.id);
        if (request !== requestId.current) return;
        if (result.data) {
          dispatch({
            type: "SESSION",
            mediaId: item.id,
            sessionId: result.data.sessionId,
            positionMs: positionMs ?? result.data.positionMs,
          });
        } else {
          dispatch({ type: "SESSION_UNAVAILABLE", mediaId: item.id });
          setNotice("Playback is available. Your progress could not be synced.");
        }
      }
    },
    [accessToken],
  );
  const enqueue = (item: MediaItem) => {
    dispatch({ type: "ENQUEUE", item });
    setNotice(`${item.title} added to Up next.`);
  };
  const close = () => {
    flushRef.current?.();
    requestId.current++;
    dispatch({ type: "CLOSE" });
  };
  const playNext = () => {
    if (state.queue[0]) void play(state.queue[0]);
    else close();
  };
  const togglePlayback = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) void media.play().catch(() => dispatch({ type: "STATUS", status: "paused" }));
    else media.pause();
  };
  return (
    <PlaybackContext.Provider
      value={{
        state,
        dispatch,
        mediaRef,
        flushRef,
        play,
        resume: play,
        enqueue,
        removeFromQueue: (mediaId) => dispatch({ type: "REMOVE", mediaId }),
        playNext,
        close,
        retry: () => dispatch({ type: "RETRY" }),
        togglePlayback,
        notice,
        setNotice,
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
}
export function usePlayback() {
  const context = useContext(PlaybackContext);
  if (!context) throw new Error("usePlayback requires PlaybackProvider");
  return context;
}
