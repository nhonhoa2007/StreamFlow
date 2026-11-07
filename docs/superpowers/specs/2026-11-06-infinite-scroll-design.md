# Infinite media loading

User request: replace manual loading with infinite scrolling while retaining the simplified black, white, and red UI.

Use IntersectionObserver with a 400px prefetch margin. Fetch 20 items per page through the existing keyset contract; extend Search with the same optional cursor. Preserve the search query and media-type filter on subsequent requests. Keep the initial editorial rails fixed and append new Home items to a vertical grid.

Only one request may run per list. Deduplicate appended IDs, cancel/ignore stale responses after a list unmounts or its query changes, stop at the last page, and reject non-advancing cursors to avoid request loops. A load failure preserves existing items and pauses automatic loading until the user selects Retry. Browsers without IntersectionObserver receive an accessible Load more fallback. Loading and end states use polite status messages.

Use publication time with creation time as a fallback so READY media lacking published_at still has a usable cursor. Keep (timestamp, id) ordering identical between the cursor predicate and query sort. No database schema changes or dependencies.

Verification: test pagination boundaries, concurrent calls, duplicate results, errors/retry, stale responses, and generated database query cursors; run the web/contracts/API checks and verify scrolling with a temporary local paginated fixture.

Implementation verified with 97 temporary fixture titles in the browser, including error/retry, type changes, query reset, end-of-list, and mobile Home. Existing unit suites and the new pagination/driver timestamp tests pass. PostgreSQL integration remains limited by initdb EPERM; see docs/ui/infinite-scroll.md for exact validation evidence.
