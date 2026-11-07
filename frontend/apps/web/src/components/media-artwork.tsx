import type { MediaType } from "@streamflow/contracts";
import { getArtworkTheme, getMediaInitials } from "./media-primitives";

export function MediaArtwork({
  title,
  type,
  variant = "landscape",
  className = "",
}: {
  title: string;
  type: MediaType;
  variant?: "hero" | "landscape" | "square";
  className?: string;
}) {
  const theme = getArtworkTheme(title, type);
  return (
    <div
      className={`relative isolate overflow-hidden ${className}`}
      style={{ background: theme.from }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        {type === "AUDIO" ? (
          <>
            <circle cx="400" cy="200" r="152" fill="none" stroke={theme.to} strokeWidth="1" />
            <circle cx="400" cy="200" r="115" fill="none" stroke={theme.to} strokeWidth="1" />
            <circle cx="400" cy="200" r="78" fill="none" stroke={theme.to} strokeWidth="1" />
            <circle cx="400" cy="200" r="12" fill={theme.accent} />
          </>
        ) : (
          <>
            <rect
              x="235"
              y="85"
              width="290"
              height="230"
              rx="4"
              fill="none"
              stroke={theme.to}
              strokeWidth="1"
            />
            <rect
              x="270"
              y="120"
              width="220"
              height="160"
              rx="2"
              fill="none"
              stroke={theme.to}
              strokeWidth="1"
            />
            <path d="M365 177L365 223L404 200Z" fill={theme.accent} />
          </>
        )}
      </svg>
      <div
        aria-hidden="true"
        className={`absolute left-5 text-white/90 ${variant === "hero" ? "bottom-8 text-7xl font-semibold tracking-tighter" : "bottom-4 text-3xl font-semibold tracking-tight"}`}
      >
        {getMediaInitials(title)}
      </div>
    </div>
  );
}
