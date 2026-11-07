# StreamFlow Website Acceptance Checklist

Use this checklist against a clean local stack with legal seeded media. Record the date, commit, browser and API base URL for each run.

## Guest

- [ ] Home loads featured, film, audio and recently added content.
- [ ] Search supports URL-backed query, media type, classification, sort and duration/date filters.
- [ ] Media detail opens and shows metadata, related titles and playback actions.
- [ ] HLS video/audio player shows buffering and recoverable error states; playback speed and quality controls are labelled.
- [ ] Library, playlists, profile and Studio show sign-in guidance without exposing private data.

## Authenticated user

- [ ] Register/login creates a session and refreshes it through the HttpOnly cookie.
- [ ] Favorite and unfavorite media is reflected in Library.
- [ ] Continue watching resumes from the saved position.
- [ ] History lists the user's ready media ordered by latest playback update.
- [ ] User can create, rename, open, add, remove and reorder playlists.
- [ ] A stale playlist version returns a conflict message and refreshes the detail view.
- [ ] Direct URLs cannot read another user's playlist or history.
- [ ] Profile shows email, role, member date and sign-out.

## Administrator

- [ ] Direct upload validates type/size, uploads to object storage and leaves a draft.
- [ ] Studio lists drafts and ready media and filters active/failed transcode jobs.
- [ ] Admin can edit metadata, publish/unpublish, delete media and trigger/retry transcode.
- [ ] Job UI distinguishes queued, processing, completed and failed states and shows the last error.
- [ ] A regular user cannot access admin mutations even when calling the API directly.

## Release checks

- [ ] Signed media URLs expire and do not expose object-store credentials.
- [ ] Upload validation rejects unsupported MIME, oversized files and forged completion.
- [ ] Redis degradation, worker retry/idempotency and database readiness behavior are documented.
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `node --test scripts/acceptance.test.mjs` have recorded results.

Deferred until after MVP: recommendations, social/chat, notifications, payment/subscription, live streaming, DRM, native mobile, multi-region and offline/PWA.
