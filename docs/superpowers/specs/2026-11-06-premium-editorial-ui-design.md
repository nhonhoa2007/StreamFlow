# StreamFlow Premium Editorial UI — Design Draft

Status: Approved by the user on 2026-11-06  
Date: 2026-11-06

## Intent

StreamFlow is a portfolio project, so the UI should communicate product judgment as clearly as the backend architecture. The redesign should make the app feel like a finished media product that a reviewer can understand within one short session: discover content, start playback, resume a session, save an item, and understand the account or admin path.

The current frontend already has a dark streaming shell, hero banner, horizontal catalog rail, auth modal, continue-watching rail, direct upload form, and HLS player. The redesign builds on those pieces while turning the experience into a coherent editorial product instead of a collection of styled components.

## Goals

- Make discovery and playback the dominant path on desktop and mobile.
- Give the product a memorable visual identity suitable for a CV portfolio.
- Make Search, Library, Details, Favorites, Continue Watching, and playback feel like connected surfaces.
- Show real media artwork and useful metadata while hiding implementation details such as cursor pagination and slugs.
- Give the upload/admin flow a deliberate workspace so it does not compete with the consumer catalog.
- Improve keyboard navigation, focus states, modal behavior, responsive layouts, loading states, and empty states.
- Keep the current Next.js, Tailwind CSS, Lucide, HLS.js, and API contracts unless a small additive API change materially improves the experience.

## Non-goals

- Replacing the API, database, storage, or transcoding architecture.
- Building recommendations based on a new machine-learning system.
- Adding payments, subscriptions, social sharing, comments, or a full CMS.
- Rebuilding the video pipeline or changing media formats.
- Adding a second visual theme during this redesign.

## Anti-goals

- A decorative Netflix clone with dead buttons or screens that do not connect to real data.
- Dense dashboards that expose backend terminology to normal viewers.
- Motion that delays playback, traps keyboard users, or makes the interface feel noisy.
- A desktop-only composition that collapses on small screens.

## Constraints and current findings

- The main route currently renders the hero, Continue Watching, admin upload, catalog rail, and player modal from one page.
- Search is currently visual only; Sidebar buttons maintain local active state rather than navigating.
- The hero has a gradient placeholder and a non-functional More Info action.
- Catalog cards support video playback and favorites, while audio has no dedicated playback surface.
- The app already uses a dark token set, Tailwind 4, Lucide icons, and HLS.js.
- Playback, favorites, auth, continue watching, and upload APIs already exist and should be reused.
- Existing UI and diagram work in the workspace must remain intact while the redesign is implemented.

## Approaches considered

### A. Visual refresh only

Keep the current information architecture and update colors, typography, artwork treatment, cards, spacing, and responsive rules. This is the lowest-risk option, but it leaves the non-functional Search, Sidebar, More Info, and audio paths visible in a portfolio review.

### B. Streaming UX overhaul

Keep the current shell but complete the primary flows: real navigation, search, details, library, audio playback, better player states, and responsive behavior. This gives a strong product result with a moderate implementation scope.

### C. Premium editorial redesign — selected

Use a new editorial composition around real artwork, a cinematic hero, content rails, a persistent mini-player, a dedicated details surface, a real search experience, a library surface, and an admin workspace. This has the highest portfolio value because it demonstrates visual direction, information architecture, interaction design, and engineering follow-through. It also requires more route and state work, so the design keeps the existing APIs and limits new backend work to fields the interface actually needs.

## Product structure

The app will use five user-facing surfaces:

1. **Home** — cinematic hero, Continue Watching, Featured, Recently Added, and genre/type rails.
2. **Search** — query input, type filters, result count, grouped results, and a useful no-results state.
3. **Library** — Favorites, Continue Watching, Recently Played, and saved items.
4. **Details** — artwork, title, type, duration, description/metadata, Play, Save, and related content.
5. **Player** — full-screen or focused playback plus a persistent mini-player when the viewer navigates away.

Admin upload will move into an account/workspace surface. It will remain available to admins but will not interrupt the viewer’s Home page.

## Visual direction

Update approved by the user on 2026-11-06: simplify the visual style to white, black, and red. Use sans-serif headings, flat neutral surfaces, red primary/selected states, restrained corners, and minimal decorative artwork. This update supersedes the original color/art direction below; the approved product flows remain the same.

The visual language will be “midnight editorial”: near-black canvas, layered graphite surfaces, one electric blue action color, a warm amber accent for audio, and large artwork that carries the visual weight. The interface will use a restrained type scale with strong titles, compact supporting labels, and clear hierarchy between primary and secondary actions.

The current color values will be consolidated into semantic tokens such as `canvas`, `surface`, `surfaceElevated`, `textPrimary`, `textSecondary`, `accent`, `audioAccent`, `danger`, and `focusRing`. Components will consume those tokens instead of repeating raw hex values.

Artwork treatment:

- Hero artwork fills the background with a readable gradient scrim.
- Cards use a consistent 16:9 media frame for video and a square or 4:3 art frame for audio.
- Missing artwork gets a deterministic branded fallback based on media type and title initials.
- Hover motion is subtle: lift, scrim, and action reveal; no layout jumps.

## Core screen sketches

### Home

```text
[StreamFlow] [Home] [Search] [Library]                  [Mini-player] [Profile]

┌─────────────────────────────────────────────────────────────────────────────┐
│ artwork + gradient                                                           │
│ VIDEO  12m 03s                                                               │
│ The title that makes the catalog feel alive                                  │
│ Short editorial description                                                  │
│ [Play] [Save] [Details]                                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Continue watching  [progress card] [progress card] [progress card]
Featured           [large card]    [large card]    [large card]
Recently added     [card]          [card]          [card]
Audio              [square card]   [square card]   [square card]
```

### Search

```text
Search StreamFlow
[ search query......................................................... ]
[All] [Videos] [Audio]                         18 results

Videos
[result card] [result card] [result card]

Audio
[result card] [result card]
```

The search page should preserve the query in the URL so it is shareable and browser navigation works.

### Details

```text
← Back
┌──────────────┐  VIDEO · 12m 03s
│ artwork      │  Title
│              │  Short description or metadata summary
└──────────────┘  [Play] [Save] [Add to queue]

More like this  [card] [card] [card]
```

### Mobile

On small screens, the sidebar becomes a fixed bottom navigation with Home, Search, Library, and Profile. The hero becomes shorter, content rails remain horizontally scrollable, and the mini-player sits above the bottom navigation. Primary actions remain reachable without opening a menu.

## Interaction model

- Every visible navigation control leads to a real route or opens a real surface.
- `Play` opens the player and starts the selected media when the browser allows it.
- `Save` updates the favorite state optimistically and exposes a clear failure state.
- `Details` opens the details route or panel with a stable URL.
- Search uses debounced requests, preserves the query in the URL, and supports keyboard submission.
- Continue Watching resumes from the saved position and shows progress visually.
- The player exposes loading, buffering, fatal error, retry, quality, captions placeholder, and close states.
- The mini-player preserves the current item when navigating between Home, Search, Library, and Details.
- Modals close with Escape, restore focus to the trigger, and prevent background interaction.

## Accessibility and responsive requirements

- Visible focus rings for all interactive elements.
- Icon-only controls include accessible labels and tooltips where appropriate.
- Modal dialogs provide a title, close label, focus management, and Escape handling.
- Color is never the only signal for type, selected state, progress, or errors.
- Reduced-motion preference disables scale and entrance motion.
- Touch targets are at least 44px on mobile.
- Keyboard users can reach navigation, search, rails, cards, player controls, and close actions in a logical order.
- Loading and error messages use live regions where status changes asynchronously.

## Component and route plan

The redesign will introduce or reshape components around product responsibilities:

- `AppShell` for desktop navigation, mobile navigation, profile, and mini-player placement.
- `MediaArtwork` for artwork, fallback, scrim, and type-specific framing.
- `HeroFeature` for the Home hero and primary actions.
- `MediaRail` and `MediaCard` for reusable video/audio/content rows.
- `SearchSurface` for query state, filters, results, and empty states.
- `MediaDetails` for the details surface.
- `PlayerShell` and `MiniPlayer` for playback states.
- `LibrarySurface` for favorites and continue watching.
- `AdminWorkspace` for upload and upload status.
- `FeedbackState` for loading, empty, degraded, and retry states.

The preferred route shape is:

- `/` — Home
- `/search?q=...&type=...` — Search
- `/library` — Library
- `/media/[id]` — Details

The current API helpers remain the data boundary. New UI work should first use existing endpoints; any missing description/artwork fields will get a deliberate fallback or a small additive contract change rather than leaking internal identifiers into the UI.

## Portfolio emphasis

The finished result should make the following engineering and product decisions visible in a demo:

- A coherent design token system rather than scattered styles.
- Reusable media primitives for video and audio.
- Real route/state transitions instead of static mock screens.
- Responsive behavior that changes composition on mobile.
- Accessible modals, controls, and asynchronous states.
- A clear separation between viewer experience and admin workflow.
- A working HLS player and persistent playback context.

## Success criteria

- A new visitor can find content, open details, start playback, save an item, and return to it without guessing.
- Search, navigation, Details, Library, and player controls are functional on desktop and mobile.
- No user-facing screen displays cursor pagination, slugs, raw API errors, or implementation terminology.
- The Home page has at least three distinct editorial content sections with useful empty states.
- Admin upload is discoverable for admins and invisible as clutter to normal viewers.
- Keyboard navigation and reduced-motion checks pass for the redesigned surfaces.
- The UI builds and typechecks without disturbing the current backend and infrastructure work.

## Risks and decisions for implementation

- Artwork may not exist in the current API. The first implementation should use deterministic fallbacks and add artwork fields only if the existing media model supports them cleanly.
- A persistent mini-player may require lifting playback state above the current catalog component. This is a contained frontend state change.
- Search may need a new API query if server-side search is unavailable. The design should avoid pretending client-side filtering is complete for a large catalog.
- Route additions should be staged so the current Home experience remains usable throughout implementation.
- The design intentionally avoids committing to a specific branding name, logo asset, or marketing copy until the visual direction is approved.

The following decisions materially change the implementation plan and are left explicit for approval:

- **Auth boundaries:** The proposed default is public browsing and playback, authenticated favorites and Continue Watching, and admin-only upload/workspace access. The existing API already follows this split.
- **Details navigation:** `/media/[id]` is proposed as the canonical, deep-linkable Details route. A card can still open it from a modal-like transition, but browser history and refresh should resolve to the route.
- **Queue:** The first pass proposes a session-local “Up next” queue for video and audio. Persisted or cross-device queues would be a separate API/data scope.
- **Search:** The preferred implementation is a server-side search query with type filtering and keyset pagination. If the catalog remains small for the portfolio demo, a bounded client-side fallback can support the first visual pass.
- **Recently Played:** The first pass proposes using the existing Continue Watching data as the real persisted activity surface. A separate Recently Played API should be added only if it is required as a distinct product concept.
- **Playback continuity:** The proposed default is persistence through the existing playback session/progress APIs for signed-in users, with in-memory continuity for logged-out visitors during one browser session.

## Approval needed

Please approve or revise:

1. The “midnight editorial” visual direction.
2. The five-surface structure: Home, Search, Library, Details, Player.
3. Moving admin upload into an admin workspace.
4. Adding real routes for Search, Library, and Details.
5. The persistent mini-player as the signature interaction.
6. The proposed auth boundaries, canonical Details route, session-local queue, server-side search target, Continue Watching-based activity, and signed-in playback persistence.

After approval, the next step is an implementation plan followed by the frontend work.
