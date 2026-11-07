# StreamFlow Premium Editorial UI Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Turn the existing StreamFlow frontend into a portfolio-ready premium editorial streaming experience with real Home, Search, Library, Details, Player, and Admin Workspace flows.

**Architecture:** Keep the existing Next.js App Router, Tailwind 4, Lucide, HLS.js, and backend contracts. Add a typed client-data layer, shared media primitives, route-level surfaces, and a client playback/queue context so playback can continue across route changes. Use deterministic artwork fallbacks because the current media contract exposes title/type/duration but no artwork URL.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, Lucide React, HLS.js, Vitest.

**Spec:** docs/superpowers/specs/2026-11-06-premium-editorial-ui-design.md

## Global Constraints

- Preserve the existing backend, storage, transcoding, and auth architecture.
- Use existing public media endpoints: GET /v1/media, GET /v1/media/:id, and GET /v1/search.
- Use existing authenticated library endpoints for favorites and Continue Watching.
- Public users may browse and play; favorites and Continue Watching require auth; upload/workspace access requires ADMIN.
- /media/[id] is the canonical deep-linkable Details route.
- The first queue is session-local; do not add queue persistence or database schema changes.
- Signed-in playback uses existing playback session/progress APIs; logged-out continuity is in-memory for the browser session.
- Do not expose slugs, cursor pagination language, raw API errors, or internal implementation terms in user-facing copy.
- Keep existing user UI and architecture diagram work intact.
- Every new interactive control must have keyboard focus, an accessible name, and a visible disabled/loading/error state.
- Honor prefers-reduced-motion and maintain 44px minimum touch targets on mobile.

## Review Focus

- Logged-out access to browse/play versus auth-gated library actions — test route rendering and favorite prompts in Tasks 1 and 5.
- Empty, loading, degraded, and no-result states — test shared feedback states and Search/Library surfaces in Tasks 2 and 5.
- Details deep links and browser back behavior — test /media/[id] rendering in Task 5.
- Playback state across route changes and failed manifest/progress requests — test the playback context and player reducer in Task 6.
- Mobile navigation, focus management, Escape handling, and reduced motion — test shell/modal behavior in Tasks 3 and 7.

---

### Task 1: Typed frontend data boundary

**Files:**
- Modify: frontend/apps/web/src/lib/media-api.ts
- Modify: frontend/apps/web/src/lib/media-api.test.ts
- Create: frontend/apps/web/src/lib/media-api.types.ts only if shared request/result types cannot remain local to media-api.ts

**Interfaces:**
- Produces searchMedia(query: string, type?: "AUDIO" | "VIDEO", baseUrl?: string): Promise<FetchMediaResult> using GET /v1/search?q=...&type=....
- Produces fetchMediaDetail(mediaId: string, baseUrl?: string): Promise<{ data?: MediaDetail; error?: string }> using GET /v1/media/:id.
- Produces fetchFavorites(token: string, baseUrl?: string): Promise<{ items: FavoriteItem[] }> using GET /v1/library/favorites.
- Produces startPlayback(token: string, mediaId: string, baseUrl?: string): Promise<{ data?: StartPlaybackResponse; error?: string }>.
- Produces updatePlaybackProgress(token: string, sessionId: string, payload: UpdateProgress, baseUrl?: string): Promise<{ data?: ProgressResponse; error?: string }>.

- [x] Step 1: Write failing tests for URL construction, query encoding, schema validation, auth headers, and API error normalization for all five functions.
- [x] Step 2: Run pnpm --filter @streamflow/web exec vitest run src/lib/media-api.test.ts and verify the new tests fail.
- [x] Step 3: Implement the functions with getApiBaseUrl, contract schemas from @streamflow/contracts, and consistent user-safe error strings.
- [x] Step 4: Run the same test command and verify all existing and new tests pass.
- [x] Step 5: Run pnpm --filter @streamflow/web typecheck.

### Task 2: Design tokens and reusable media primitives

**Files:**
- Modify: frontend/apps/web/src/app/globals.css
- Create: frontend/apps/web/src/components/media-artwork.tsx
- Create: frontend/apps/web/src/components/media-card.tsx
- Create: frontend/apps/web/src/components/media-rail.tsx
- Create: frontend/apps/web/src/components/feedback-state.tsx
- Create: frontend/apps/web/src/components/media-primitives.test.tsx or pure helper tests adjacent to the primitives, following the existing Vitest setup

**Interfaces:**
- MediaArtwork({ title, type, variant, className? }) renders deterministic fallback artwork for VIDEO or AUDIO; variant is "hero" | "landscape" | "square".
- MediaCard({ item, variant?, onPlay?, onOpenDetails?, onToggleFavorite? }) renders title, type, duration, artwork, progress when supplied, and accessible actions.
- MediaRail({ title, eyebrow?, items, renderItem?, emptyMessage? }) renders a labeled horizontal rail with keyboard-reachable cards and an optional empty state.
- FeedbackState({ kind, title, message, action? }) supports "loading" | "empty" | "error".

- [x] Step 1: Write failing tests for deterministic artwork output, duration/type labels, accessible card actions, and loading/empty/error variants.
- [x] Step 2: Run the focused primitive test file and verify failure.
- [x] Step 3: Implement semantic tokens and primitives; replace repeated raw hex values with semantic CSS variables where practical.
- [x] Step 4: Run focused tests, pnpm --filter @streamflow/web typecheck, and pnpm exec biome check frontend/apps/web/src.

### Task 3: App shell, navigation, and auth surface

**Files:**
- Modify: frontend/apps/web/src/app/layout.tsx
- Modify: frontend/apps/web/src/components/sidebar.tsx
- Modify: frontend/apps/web/src/components/user-menu.tsx
- Modify: frontend/apps/web/src/components/auth-modal.tsx
- Create: frontend/apps/web/src/components/app-shell.tsx
- Create: frontend/apps/web/src/components/mobile-nav.tsx
- Create: frontend/apps/web/src/components/search-trigger.tsx
- Create: frontend/apps/web/src/components/app-shell.test.tsx

**Interfaces:**
- AppShell({ children }) owns desktop header, desktop sidebar, mobile bottom navigation, modal portal placement, and mini-player slot.
- Navigation links are real Next links to /, /search, and /library; active state derives from the current pathname.
- SearchTrigger navigates to /search and preserves a submitted query in the URL.

- [x] Step 1: Write failing tests for route links, active pathname state, admin badge visibility, logged-out sign-in action, mobile navigation labels, and Escape-to-close auth modal behavior.
- [x] Step 2: Run the focused shell tests and verify failure.
- [x] Step 3: Implement AppShell and move existing layout composition into it; preserve AuthProvider and existing auth behavior.
- [x] Step 4: Add mobile bottom navigation and focus-visible styles, including reduced-motion rules in globals.css.
- [x] Step 5: Run focused tests, pnpm --filter @streamflow/web typecheck, and pnpm exec biome check frontend/apps/web/src.

### Task 4: Editorial Home surface

**Files:**
- Modify: frontend/apps/web/src/app/page.tsx
- Modify: frontend/apps/web/src/components/catalog.tsx
- Modify: frontend/apps/web/src/components/hero-banner.tsx
- Modify: frontend/apps/web/src/components/continue-watching.tsx
- Modify: frontend/apps/web/src/components/favorite-button.tsx
- Create: frontend/apps/web/src/components/hero-feature.tsx if the current hero component becomes too large
- Create: frontend/apps/web/src/components/home-sections.tsx

**Interfaces:**
- HeroFeature({ item, onPlay, onSave, onDetails }) renders artwork-backed hero actions.
- HomeSections({ items, continueItems, onPlay, onDetails }) renders Continue Watching, Featured, Recently Added, and Audio rails.
- Catalog filters use user-facing labels only: All, Videos, Audio.

- [x] Step 1: Write failing tests for hero primary/secondary actions, deterministic fallback artwork, section ordering, empty Continue Watching behavior, and hiding Admin Workspace entry for non-admin users.
- [x] Step 2: Run the focused Home tests and verify failure.
- [x] Step 3: Implement the Home composition using MediaArtwork, MediaCard, MediaRail, and existing fetchMedia/fetchContinueWatching data.
- [x] Step 4: Remove technical copy such as Keyset cursor pagination and slug display; preserve pagination through the data layer.
- [x] Step 5: Run focused tests plus pnpm --filter @streamflow/web build.

### Task 5: Search, Library, and Details routes

**Files:**
- Create: frontend/apps/web/src/app/search/page.tsx
- Create: frontend/apps/web/src/app/library/page.tsx
- Create: frontend/apps/web/src/app/media/[id]/page.tsx
- Create: frontend/apps/web/src/components/search-surface.tsx
- Create: frontend/apps/web/src/components/library-surface.tsx
- Create: frontend/apps/web/src/components/media-details.tsx
- Create: frontend/apps/web/src/components/search-surface.test.tsx
- Create: frontend/apps/web/src/components/library-surface.test.tsx
- Create: frontend/apps/web/src/components/media-details.test.tsx

**Interfaces:**
- Search reads searchParams.q and searchParams.type, debounces client-side refinement only when the user edits the input, and calls searchMedia for server-side results.
- Library shows authenticated Favorites and Continue Watching; logged-out users see an auth prompt with public navigation preserved.
- Details receives params.id, calls fetchMediaDetail, and renders Play, Save, Add to queue, and related content.
- MediaDetails uses onAddToQueue(item: MediaItem) supplied by the playback context.

- [x] Step 1: Write failing tests for query URL state, type filters, no-results/error states, logged-out library prompt, detail not-found state, and Details actions.
- [x] Step 2: Run focused route/component tests and verify failure.
- [x] Step 3: Implement the three routes and surfaces using the typed data boundary and shared primitives.
- [x] Step 4: Add browser-history-safe Details navigation with a real back link and stable /media/[id] URLs.
- [x] Step 5: Run focused tests, pnpm --filter @streamflow/web typecheck, and pnpm --filter @streamflow/web build.

### Task 6: Playback context, Details queue, player shell, and mini-player

**Files:**
- Create: frontend/apps/web/src/lib/playback-context.tsx
- Create: frontend/apps/web/src/lib/playback-reducer.ts
- Create: frontend/apps/web/src/lib/playback-reducer.test.ts
- Modify: frontend/apps/web/src/components/video-player.tsx
- Create: frontend/apps/web/src/components/player-shell.tsx
- Create: frontend/apps/web/src/components/mini-player.tsx
- Modify: frontend/apps/web/src/app/layout.tsx
- Modify: frontend/apps/web/src/components/media-details.tsx

**Interfaces:**
- PlaybackProvider({ children }) exposes state, play(item), resume(item, positionMs), enqueue(item), removeFromQueue(mediaId), playNext(), close(), and retry().
- PlaybackState contains currentItem: MediaItem | null, sessionId: string | null, positionMs, queue: MediaItem[], status: "idle" | "loading" | "playing" | "paused" | "error", and error: string | null.
- PlayerShell owns full player layout, loading/error/retry states, quality selection, close action, and progress reporting.
- MiniPlayer renders above mobile navigation and in the desktop shell when currentItem exists.

- [x] Step 1: Write failing reducer tests for play, pause/update, enqueue deduplication, remove, next, close, retry, and error transitions.
- [x] Step 2: Run pnpm --filter @streamflow/web exec vitest run src/lib/playback-reducer.test.ts and verify failure.
- [x] Step 3: Implement the reducer and provider; use startPlayback for authenticated users and retain local continuity for logged-out users.
- [x] Step 4: Refactor the current HLS logic into PlayerShell, keeping Hls.js and adding safe cleanup, retry, buffering status, and progress updates.
- [x] Step 5: Wire Add to queue, Play, Resume, and Play next from Details, Home, rails, and MiniPlayer.
- [x] Step 6: Run reducer/component tests, pnpm --filter @streamflow/web typecheck, and pnpm --filter @streamflow/web build.

### Task 7: Admin Workspace and interaction polish

**Files:**
- Create: frontend/apps/web/src/app/admin/page.tsx
- Create: frontend/apps/web/src/components/admin-workspace.tsx
- Modify: frontend/apps/web/src/components/admin-upload.tsx
- Modify: frontend/apps/web/src/components/auth-modal.tsx
- Modify: frontend/apps/web/src/app/globals.css
- Create: frontend/apps/web/src/components/interaction-a11y.test.tsx

**Interfaces:**
- /admin renders AdminWorkspace only for user.role === ADMIN; unauthorized users receive a clear access state and a route back to Home.
- AdminWorkspace hosts upload, upload progress, success/error feedback, and future moderation slots without appearing in the consumer Home flow.

- [x] Step 1: Write failing tests for admin-only visibility, unauthorized route state, upload progress/error rendering, Escape/focus behavior, focus-visible styles, and reduced-motion CSS presence.
- [x] Step 2: Run focused tests and verify failure.
- [x] Step 3: Move the upload UI into the workspace and keep the current direct-to-storage behavior unchanged.
- [x] Step 4: Polish auth and upload modal semantics: labels, aria-live status, focus return, disabled states, and error copy.
- [x] Step 5: Run focused tests, pnpm --filter @streamflow/web typecheck, and pnpm exec biome check frontend/apps/web/src.

### Task 8: Whole-frontend verification and portfolio pass

**Files:**
- Modify: only files found during the verification pass; do not alter backend or unrelated UI/diagram work.

- [x] Step 1: Run pnpm --filter @streamflow/web test and verify all web tests pass.
- [x] Step 2: Run pnpm --filter @streamflow/web typecheck and pnpm --filter @streamflow/web build sequentially.
- [x] Step 3: Run pnpm check and git diff --check.
- [x] Step 4: Manually verify desktop and mobile layouts: Home rails, Search, Library auth prompt, Details deep link, player/mini-player, admin workspace, keyboard focus, Escape close, reduced motion, and no-results/error states.
- [x] Step 5: Review git status --short and confirm existing UI/diagram files remain present and no conflict markers or unmerged paths exist.
- [ ] Step 6: Commit coherent milestones — deferred to preserve overlapping pre-existing changes; see the implementation ledger.

