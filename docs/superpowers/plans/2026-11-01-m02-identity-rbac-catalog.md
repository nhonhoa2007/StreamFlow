# StreamFlow M02 Identity, RBAC, Catalog & SQL Fundamentals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement secure authentication with Argon2id and token rotation, role-based access control (USER/ADMIN), relational catalog expansion (artists, albums, media), and high-performance keyset cursor pagination with verified SQL benchmarks.

**Architecture:** Extend the modular monolith with an `AuthModule` and `AdminModule` while enriching `MediaModule`. Security uses short-lived JWT Access Tokens via Authorization Bearer headers and long-lived Refresh Tokens stored as SHA-256 hashes in PostgreSQL and sent via HttpOnly Secure cookies. Token reuse triggers instant revocation of all user sessions. The media catalog adopts `O(1)` keyset pagination using tuple comparison `(published_at, id) < ($cursor_published_at, $cursor_id)` backed by composite indexes.

**Tech Stack:** NestJS 11 + Fastify, Drizzle ORM + postgres.js, PostgreSQL 16, `@node-rs/argon2`, `@fastify/cookie`, `@fastify/rate-limit`, `jsonwebtoken`, Zod, Next.js 15, Vitest, Testcontainers, Biome.

**Spec:** `docs/superpowers/specs/2026-11-01-m02-identity-rbac-catalog-design.md`

## Global Constraints

- Passwords hashed with Argon2id using recommended cost parameters (64MB memory, 3 iterations, 4 parallelism).
- Refresh tokens are 32-byte cryptographically secure random hex strings; only their SHA-256 hex digest (`token_hash`) is stored in PostgreSQL.
- Refresh token cookies: `HttpOnly; SameSite=Lax; Path=/v1/auth; Max-Age=604800` (7 days); `Secure` enabled in production.
- Access token lifespan: 15 minutes, signed with `JWT_SECRET` (minimum 32 characters), validated via `AuthGuard`.
- Replaying a revoked refresh token immediately revokes all active sessions for that user (Reuse Detection).
- Media items in public catalog endpoints (`/v1/media`, `/v1/media/:id`, `/v1/search`) must have `status = 'READY'`; `DRAFT` items are strictly restricted to `ADMIN` roles.
- Keyset cursor pagination uses Base64 encoded JSON `{ publishedAt: string, id: string }` and deterministic sorting `(published_at DESC, id DESC)`.
- Commit messages follow Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. Concurrent duplicate registrations with identical email must be rejected with 409 Conflict via database unique violation (`23505`) without application unhandled errors (Task 4).
2. Presenting a revoked refresh token must revoke all active sessions for that user and return 401 Unauthorized (Task 4).
3. Public catalog must never expose `DRAFT` media items or internal database timestamps in responses (Tasks 2 & 6).
4. Non-admin users attempting to access `/v1/admin/*` must receive 403 Forbidden, and unauthenticated requests must receive 401 Unauthorized (Task 7).
5. Keyset pagination must handle boundary conditions (null/empty cursor, last page with no next cursor, empty catalog) without skipping or duplicating items (Task 6).

---

## File Map

- `backend/packages/database/src/schema.ts`: Add `users`, `refresh_sessions`, `artists`, `albums`, `media_artists` tables and expand `media`.
- `backend/packages/database/drizzle/`: Generated and reviewed migration SQL files.
- `backend/packages/database/src/{user-repository,session-repository,catalog-repository}.ts`: Relational queries, token session operations, and keyset cursor seeks.
- `shared/contracts/src/{auth,catalog,admin}.ts`: Zod schemas for auth DTOs, cursor pagination, media detail, search, and admin CRUD.
- `backend/packages/config/src/index.ts`: Add `JWT_SECRET` validation (min 32 chars).
- `backend/apps/api/src/auth/{auth.module,auth.service,auth.controller,auth.guard,roles.guard,roles.decorator,public.decorator}.ts`: Full auth, token rotation, and RBAC guards.
- `backend/apps/api/src/media/{media.controller,media.service}.ts`: Enhanced catalog with cursor pagination, media detail with relations, and search.
- `backend/apps/api/src/admin/{admin.module,admin.controller,admin.service}.ts`: Admin media management endpoints.
- `frontend/apps/web/src/lib/{auth-context,media-api}.ts` & components: Next.js auth state, login/register modal/page, and infinite cursor pagination.
- `scripts/perf/run-pagination-benchmark.mjs` & `docs/experiments/002-keyset-pagination-benchmark.md`: Keyset vs. OFFSET benchmark on 10,000 records.
- `docs/adr/002-token-and-session-strategy.md`: Architecture decision record for token lifecycle.

---

### Task 1: Relational Schema & Migrations

**Files:**
- Modify: `backend/packages/database/src/schema.ts`
- Modify: `backend/packages/database/src/index.ts`
- Create: `backend/packages/database/drizzle/0001_identity_and_catalog.sql`
- Test: `backend/packages/database/test/database.integration.test.ts`

**Interfaces:**
- Produces: `usersTable`, `refreshSessionsTable`, `artistsTable`, `albumsTable`, `mediaArtistsTable`, `mediaTable` (with `album_id`, `published_at`).
- Exported Types: `UserSelect`, `UserInsert`, `RefreshSessionSelect`, `ArtistSelect`, `AlbumSelect`, `MediaArtistSelect`.

- [ ] **Step 1: Write failing integration test for expanded schema**
Add tests in `database.integration.test.ts` verifying that `users`, `refresh_sessions`, `artists`, `albums`, and `media_artists` tables exist, accept inserts, enforce unique email constraint on `users`, foreign key cascading on delete, and composite index `(status, published_at DESC, id DESC)`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: FAIL with "usersTable / artistsTable not defined".

- [ ] **Step 3: Define schema in `schema.ts` & generate migration**
Add `userRoleEnum`, `artistRoleEnum`, `usersTable`, `refreshSessionsTable`, `artistsTable`, `albumsTable`, `mediaArtistsTable`, and alter `mediaTable` with `albumId` and `publishedAt`. Run `pnpm --filter @streamflow/database db:generate`.

- [ ] **Step 4: Run integration test to verify success**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: PASS with all tables created and relations functioning.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/database/
git commit -m "feat(database): expand schema with users, sessions, artists, and albums"
```

---

### Task 2: Shared Contracts & Environment Configuration

**Files:**
- Create: `shared/contracts/src/auth.ts`
- Create: `shared/contracts/src/catalog.ts`
- Create: `shared/contracts/src/admin.ts`
- Modify: `shared/contracts/src/index.ts`
- Modify: `shared/contracts/src/media.test.ts`
- Modify: `backend/packages/config/src/index.ts`
- Modify: `backend/packages/config/src/index.test.ts`

**Interfaces:**
- Produces in contracts: `RegisterRequestSchema`, `LoginRequestSchema`, `AuthResponseSchema`, `UserSummarySchema`, `CursorPaginationQuerySchema`, `PaginatedMediaResponseSchema`, `MediaDetailSchema`, `SearchQuerySchema`, `AdminCreateMediaSchema`, `AdminUpdateMediaSchema`.
- Produces in config: `JWT_SECRET` in `ApiEnv` (string, min 32 characters).

- [ ] **Step 1: Write failing unit tests for new contracts and config**
Write tests in `shared/contracts/src/auth.test.ts` and `catalog.test.ts` checking validation of registration (password complexity, lowercase email), login, cursor decoding, media detail with artists/album, and config requiring `JWT_SECRET >= 32 chars`.

- [ ] **Step 2: Run tests to verify failure**
Run: `pnpm --filter @streamflow/contracts test && pnpm --filter @streamflow/config test`
Expected: FAIL on missing schemas and `JWT_SECRET`.

- [ ] **Step 3: Implement schemas and config validation**
Implement Zod schemas in `shared/contracts/src/{auth,catalog,admin}.ts` and re-export in `index.ts`. Add `JWT_SECRET: z.string().min(32)` to `backend/packages/config/src/index.ts`. Update `.env.example` with `JWT_SECRET`.

- [ ] **Step 4: Run tests and typecheck to verify success**
Run: `pnpm --filter @streamflow/contracts test && pnpm --filter @streamflow/config test && pnpm --filter @streamflow/contracts typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**
Run:
```bash
git add shared/contracts/ backend/packages/config/ .env.example
git commit -m "feat(contracts): add auth, catalog, admin schemas and jwt secret config"
```

---

### Task 3: Auth Core: Password Hashing, Tokens & Session Repository

**Files:**
- Create: `backend/packages/database/src/user-repository.ts`
- Create: `backend/packages/database/src/session-repository.ts`
- Create: `backend/apps/api/src/auth/crypto.util.ts`
- Create: `backend/apps/api/src/auth/crypto.util.test.ts`
- Modify: `backend/packages/database/src/index.ts`
- Modify: `backend/apps/api/package.json`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(hash: string, password: string): Promise<boolean>`
  - `generateOpaqueToken(): { rawToken: string, tokenHash: string }`
  - `hashToken(rawToken: string): string`
  - `createUser(db, { email, passwordHash, role }): Promise<UserSelect>`
  - `findUserByEmail(db, email): Promise<UserSelect | null>`
  - `findUserById(db, id): Promise<UserSelect | null>`
  - `createRefreshSession(db, { userId, tokenHash, expiresAt }): Promise<RefreshSessionSelect>`
  - `findSessionByTokenHash(db, tokenHash): Promise<RefreshSessionSelect | null>`
  - `revokeSession(db, sessionId): Promise<void>`
  - `revokeAllSessionsForUser(db, userId): Promise<void>`

- [ ] **Step 1: Write failing tests for crypto utilities and session repositories**
Add unit tests in `crypto.util.test.ts` verifying Argon2id hashing and verification, timing safety, and SHA-256 token hashing. Add integration test in `backend/packages/database/test/database.integration.test.ts` testing user creation, session creation, session lookup by hash, and revoke-all.

- [ ] **Step 2: Run tests to verify failure**
Run: `pnpm --filter @streamflow/api test && pnpm --filter @streamflow/database test:integration`
Expected: FAIL on missing modules.

- [ ] **Step 3: Implement crypto utils and database repositories**
Install `@node-rs/argon2`, `jsonwebtoken`, `@types/jsonwebtoken` in `backend/apps/api`. Implement `crypto.util.ts`, `user-repository.ts`, and `session-repository.ts`.

- [ ] **Step 4: Run tests to verify success**
Run: `pnpm --filter @streamflow/api test && pnpm --filter @streamflow/database test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/ backend/packages/database/
git commit -m "feat(auth): implement argon2id hashing, token utils, and session repositories"
```

---

### Task 4: Authentication Endpoints, Token Rotation & Race Condition Experiment

**Files:**
- Create: `backend/apps/api/src/auth/auth.service.ts`
- Create: `backend/apps/api/src/auth/auth.controller.ts`
- Create: `backend/apps/api/src/auth/auth.module.ts`
- Modify: `backend/apps/api/src/app.module.ts`
- Test: `backend/apps/api/test/auth.integration.test.ts`

**Interfaces:**
- Endpoints:
  - `POST /v1/auth/register` (body: `RegisterRequestSchema`) -> returns `AuthResponseSchema`, sets cookie
  - `POST /v1/auth/login` (body: `LoginRequestSchema`) -> returns `AuthResponseSchema`, sets cookie
  - `POST /v1/auth/refresh` (cookie: `refresh_token`) -> returns `AuthResponseSchema`, sets new cookie
  - `POST /v1/auth/logout` (cookie: `refresh_token`) -> clears cookie, returns `{ status: "ok" }`
  - `GET /v1/auth/me` -> returns `UserSummarySchema`

- [ ] **Step 1: Write failing integration tests for Auth endpoints**
In `auth.integration.test.ts`:
1. Register new user -> 201 with access token & httpOnly cookie.
2. Login with valid credentials -> 200 with access token & httpOnly cookie.
3. Login with wrong password -> 401 Unauthorized.
4. Token rotation: calling `/refresh` with cookie returns new access token and new cookie. Old token is revoked.
5. **Token Reuse Detection:** Calling `/refresh` with the already revoked old token triggers revocation of ALL sessions for that user and returns 401. Subsequent `/refresh` with the newer token now also fails with 401!
6. Logout revokes session and clears cookie.
7. **Experiment 1 (Concurrency Race):** Two concurrent registration requests with identical email `race@example.com` simultaneously via `Promise.all`. Exactly one succeeds (201), the other returns 409 Conflict with duplicate email message. Exactly 1 user in DB.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL on missing `/v1/auth/*` routes.

- [ ] **Step 3: Implement Auth module and endpoints**
Register `@fastify/cookie` and `@fastify/rate-limit` in Fastify adapter. Implement `AuthService` (register, login, refresh with reuse detection, logout) and `AuthController`. Handle Postgres error code `23505` on register to throw `ConflictException('Email already registered')`.

- [ ] **Step 4: Run integration tests to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS on all auth flows and race condition test.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(api): implement auth endpoints with token rotation, reuse detection, and race handling"
```

---

### Task 5: RBAC Guards & Route Protection

**Files:**
- Create: `backend/apps/api/src/auth/auth.guard.ts`
- Create: `backend/apps/api/src/auth/roles.guard.ts`
- Create: `backend/apps/api/src/auth/roles.decorator.ts`
- Create: `backend/apps/api/src/auth/public.decorator.ts`
- Modify: `backend/apps/api/src/auth/auth.module.ts`
- Test: `backend/apps/api/test/rbac.integration.test.ts`

**Interfaces:**
- Produces: `@Roles('ADMIN' | 'USER')`, `@Public()`, `AuthGuard`, `RolesGuard`.
- Injects: `req.user: { sub: string, email: string, role: 'USER' | 'ADMIN' }`.

- [ ] **Step 1: Write failing tests for AuthGuard and RolesGuard**
In `rbac.integration.test.ts`:
1. Request to protected route without Bearer token -> 401 Unauthorized.
2. Request with expired/invalid Bearer token -> 401 Unauthorized.
3. Request to `@Public()` route (e.g. `/health/live`, `/v1/media`) without token -> 200 OK.
4. Request to `@Roles('ADMIN')` route with `role: 'USER'` -> 403 Forbidden.
5. Request to `@Roles('ADMIN')` route with `role: 'ADMIN'` -> 200 OK.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL on missing guards.

- [ ] **Step 3: Implement Guards and Decorators**
Implement `AuthGuard` verifying JWT access token, and `RolesGuard` checking `Reflector.get(ROLES_KEY)` against `req.user.role`.

- [ ] **Step 4: Run integration tests to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(auth): implement auth and roles guards with public and roles decorators"
```

---

### Task 6: Keyset Cursor Pagination, Relational Detail & Search Endpoints

**Files:**
- Create: `backend/packages/database/src/catalog-repository.ts`
- Modify: `backend/packages/database/src/index.ts`
- Modify: `backend/apps/api/src/media/media.service.ts`
- Modify: `backend/apps/api/src/media/media.controller.ts`
- Test: `backend/apps/api/test/catalog.integration.test.ts`

**Interfaces:**
- Endpoints:
  - `GET /v1/media?type=&limit=&cursor=` -> `PaginatedMediaResponseSchema`
  - `GET /v1/media/:id` -> `MediaDetailSchema` (404 if draft for public, returns artists and album)
  - `GET /v1/search?q=&type=&limit=` -> `PaginatedMediaResponseSchema`
- Database functions:
  - `listMediaKeyset(db, query: CursorPaginationQuery): Promise<{ items: MediaItem[], nextCursor: string | null, hasMore: boolean }>`
  - `getMediaDetail(db, id: string): Promise<MediaDetail | null>`
  - `searchMedia(db, query: SearchQuery): Promise<MediaItem[]>`

- [ ] **Step 1: Write failing integration tests for Keyset Pagination and Search**
In `catalog.integration.test.ts`:
1. Seed 25 READY items with staggered `published_at`.
2. Fetch page 1 with `limit=10` -> returns 10 items, `hasMore: true`, valid `nextCursor`.
3. Fetch page 2 using `cursor=<nextCursor>` -> returns next 10 items.
4. Verify: No item in page 2 is duplicated from page 1, no item is skipped.
5. Fetch page 3 -> returns remaining 5 items, `hasMore: false`, `nextCursor: null`.
6. Detail endpoint `GET /v1/media/:id` returns artists with roles and album.
7. Search endpoint `GET /v1/search?q=...` returns matched titles or artists.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL on cursor pagination and detail endpoints.

- [ ] **Step 3: Implement Keyset SQL queries and API methods**
Encode/decode Base64 cursor `{ publishedAt: string, id: string }`. In `catalog-repository.ts`, use SQL comparison `WHERE status = 'READY' AND (published_at < $cursorTime OR (published_at = $cursorTime AND id < $cursorId))`. Fetch `limit + 1` to determine `hasMore` and `nextCursor`. Implement relations join for detail and search queries.

- [ ] **Step 4: Run integration tests to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/database/ backend/apps/api/
git commit -m "feat(media): implement keyset cursor pagination, media detail, and search"
```

---

### Task 7: Admin Media Management Endpoints (`/v1/admin/media`)

**Files:**
- Create: `backend/apps/api/src/admin/admin.service.ts`
- Create: `backend/apps/api/src/admin/admin.controller.ts`
- Create: `backend/apps/api/src/admin/admin.module.ts`
- Modify: `backend/apps/api/src/app.module.ts`
- Test: `backend/apps/api/test/admin.integration.test.ts`

**Interfaces:**
- Endpoints (all require `@Roles('ADMIN')`):
  - `POST /v1/admin/media` -> 201 Created
  - `GET /v1/admin/media` -> 200 list (including DRAFTs)
  - `PATCH /v1/admin/media/:id` -> 200 update (status READY sets `published_at = now()`)
  - `DELETE /v1/admin/media/:id` -> 200 deleted

- [ ] **Step 1: Write failing tests for Admin CRUD**
In `admin.integration.test.ts`:
1. Non-authenticated request returns 401.
2. User with role `USER` returns 403 Forbidden.
3. User with role `ADMIN` can create media (starts as DRAFT).
4. Admin can list all media (both DRAFT and READY visible).
5. Admin can update media and set status to READY (verifying `published_at` is set).
6. Admin can delete media.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL on missing admin module.

- [ ] **Step 3: Implement Admin Module**
Implement `AdminService`, `AdminController`, and attach `@Roles('ADMIN')`. Wire into `AppModule`.

- [ ] **Step 4: Run integration tests to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(admin): implement admin media management endpoints with rbac protection"
```

---

### Task 8: Web Frontend: Auth State & Cursor Pagination UI

**Files:**
- Create: `frontend/apps/web/src/lib/auth-context.tsx`
- Create: `frontend/apps/web/src/components/auth-modal.tsx`
- Create: `frontend/apps/web/src/components/user-menu.tsx`
- Modify: `frontend/apps/web/src/app/page.tsx`
- Modify: `frontend/apps/web/src/components/catalog.tsx`
- Modify: `frontend/apps/web/src/app/layout.tsx`
- Test: `frontend/apps/web/src/lib/media-api.test.ts`

**Interfaces:**
- `useAuth()` hook providing `{ user, accessToken, login, register, logout, isAuthenticated }`.
- `fetchMedia(baseUrl, { cursor, type, limit })` returning `PaginatedMediaResponse`.
- Catalog view with "Load More" button for next cursor page.

- [ ] **Step 1: Write failing tests for web media-api and auth utilities**
Add tests in `frontend/apps/web/src/lib/media-api.test.ts` verifying cursor query parameter forwarding, paginated response parsing, and error handling.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/web test`
Expected: FAIL.

- [ ] **Step 3: Implement Auth Context, User Menu, and Cursor UI**
Implement `auth-context.tsx` with silent refresh on mount. Add Login/Register modal. Update `catalog.tsx` to handle loading additional pages with `nextCursor`.

- [ ] **Step 4: Run web test, typecheck, and build to verify success**
Run: `pnpm --filter @streamflow/web test && pnpm --filter @streamflow/web typecheck && pnpm --filter @streamflow/web build`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add frontend/apps/web/
git commit -m "feat(web): add auth context, user menu, and keyset pagination load more"
```

---

### Task 9: 10,000 Records Benchmark Experiment, ADR-002 & Acceptance

**Files:**
- Create: `backend/packages/database/src/seed-10k.ts`
- Create: `scripts/perf/run-pagination-benchmark.mjs`
- Create: `docs/experiments/002-keyset-pagination-benchmark.md`
- Create: `docs/adr/002-token-and-session-strategy.md`
- Modify: `scripts/acceptance.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Script `pnpm --filter @streamflow/database db:seed-10k` inserts 10,000 synthetic items.
- Script `node scripts/perf/run-pagination-benchmark.mjs` executes both OFFSET 9980 and Keyset Cursor, records buffers and execution time.
- Documentation deliverables committed.

- [ ] **Step 1: Write failing acceptance test checking M02 artifacts**
In `scripts/acceptance.test.mjs`, assert `docs/adr/002-token-and-session-strategy.md`, `docs/experiments/002-keyset-pagination-benchmark.md`, and benchmark script exist.

- [ ] **Step 2: Run acceptance test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL on missing M02 docs.

- [ ] **Step 3: Implement 10k seed script, benchmark runner, and documentation**
Write `seed-10k.ts` using batch inserts. Write `run-pagination-benchmark.mjs` running `EXPLAIN (ANALYZE, BUFFERS)` on both queries against local PostgreSQL. Write ADR-002 and experiment report. Update README with M02 commands.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All suites PASS with 0 errors.

- [ ] **Step 5: Commit**
Run:
```bash
git add .
git commit -m "docs: add m02 pagination benchmark report, adr-002, and acceptance tests"
```
