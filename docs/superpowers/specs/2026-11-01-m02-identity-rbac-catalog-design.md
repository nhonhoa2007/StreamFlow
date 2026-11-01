# Milestone 02 Specification: Identity, RBAC, Catalog & SQL Fundamentals

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M02 (Weeks 3–4)
- **Date:** 2026-11-01
- **Status:** Approved / Ready for Implementation Planning

---

## 1. Executive Summary & Objectives

Milestone 02 introduces identity management, role-based access control (RBAC), and advanced catalog capabilities with production-grade SQL indexing into StreamFlow:
1. **Authentication & Session Security:** Argon2id password hashing, short-lived JWT Access Tokens (15 min) in authorization headers, and long-lived Refresh Tokens (7 days) stored as SHA-256 hashes in PostgreSQL and transmitted via HttpOnly Secure SameSite cookies.
2. **Session Hijacking Defense (Token Reuse Detection):** Immediate revocation of all user sessions when a previously revoked refresh token is replayed.
3. **Role-Based Access Control (RBAC):** Hierarchical roles (`USER`, `ADMIN`) protecting public catalog vs. administrative media management.
4. **Relational Metadata Modeling:** Extending the media domain with `artists`, `albums`, and `media_artists` (many-to-many relationship with roles).
5. **Keyset (Cursor) Pagination:** Scalable `O(1)` index-seek pagination replacing naive `OFFSET` queries.
6. **SQL Performance & Concurrency Experiments:**
   - Experiment 1: High-concurrency duplicate email registration race condition verifying database constraints as the definitive invariant guard.
   - Experiment 2: Benchmark and execution plan comparison (`EXPLAIN (ANALYZE, BUFFERS)`) between `OFFSET` and Keyset Cursor pagination across a 10,000-record dataset.
7. **Architectural Decision Record (ADR-002):** Documenting token lifecycle, session revocation, and cookie security strategies.

---

## 2. Database Schema & Relational Design

All schema definitions live in `backend/packages/database/src/schema.ts` and migrations are versioned via Drizzle Kit.

### 2.1 Enums
- `user_role`: `'USER' | 'ADMIN'`
- `artist_role`: `'MAIN' | 'FEATURED' | 'PRODUCER'`

### 2.2 Table Definitions

#### `users`
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `email`: `varchar(255)`, not null, unique index on `lower(trim(email))`.
- `password_hash`: `varchar(255)`, not null (Argon2id format).
- `role`: `user_role`, not null, default `'USER'`.
- `created_at`: `timestamp with time zone`, not null, default `now()`.
- `updated_at`: `timestamp with time zone`, not null, default `now()`.

#### `refresh_sessions`
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `user_id`: `uuid`, not null, foreign key references `users(id)` ON DELETE CASCADE.
- `token_hash`: `varchar(64)`, not null, unique index (SHA-256 hex digest of the raw refresh token).
- `expires_at`: `timestamp with time zone`, not null.
- `revoked_at`: `timestamp with time zone`, nullable.
- `created_at`: `timestamp with time zone`, not null, default `now()`.
- Indices:
  - Unique index on `token_hash`.
  - Composite index on `(user_id, revoked_at)`.

#### `artists`
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `name`: `varchar(255)`, not null.
- `slug`: `varchar(255)`, not null, unique index.
- `bio`: `text`, nullable.
- `created_at`: `timestamp with time zone`, not null, default `now()`.
- `updated_at`: `timestamp with time zone`, not null, default `now()`.

#### `albums`
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `title`: `varchar(255)`, not null.
- `slug`: `varchar(255)`, not null, unique index.
- `artist_id`: `uuid`, nullable, foreign key references `artists(id)` ON DELETE SET NULL.
- `release_year`: `integer`, nullable.
- `created_at`: `timestamp with time zone`, not null, default `now()`.
- `updated_at`: `timestamp with time zone`, not null, default `now()`.

#### `media` (Expanded from M01)
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `type`: `media_type` (`'AUDIO' | 'VIDEO'`), not null.
- `title`: `varchar(255)`, not null.
- `slug`: `varchar(255)`, not null, unique index.
- `status`: `media_status` (`'DRAFT' | 'READY'`), not null, default `'DRAFT'`.
- `duration_ms`: `integer`, nullable.
- `album_id`: `uuid`, nullable, foreign key references `albums(id)` ON DELETE SET NULL.
- `published_at`: `timestamp with time zone`, nullable.
- `created_at`: `timestamp with time zone`, not null, default `now()`.
- `updated_at`: `timestamp with time zone`, not null, default `now()`.
- Indices:
  - Unique index on `slug`.
  - Composite index on `(status, published_at DESC, id DESC)`.

#### `media_artists` (Many-to-Many Join Table)
- `media_id`: `uuid`, not null, foreign key references `media(id)` ON DELETE CASCADE.
- `artist_id`: `uuid`, not null, foreign key references `artists(id)` ON DELETE CASCADE.
- `role`: `artist_role`, not null, default `'MAIN'`.
- Primary Key: `(media_id, artist_id)`.
- Index on `artist_id` for reverse catalog lookups.

---

## 3. Shared Contracts (`shared/contracts`)

Exported from `@streamflow/contracts`:

### 3.1 Auth Schemas
- `RegisterRequestSchema`:
  - `email`: `z.string().email().transform(v => v.toLowerCase().trim())`.
  - `password`: `z.string().min(8).regex(/[A-Za-z]/).regex(/[0-9]/)`.
- `LoginRequestSchema`:
  - `email`: `z.string().email().transform(v => v.toLowerCase().trim())`.
  - `password`: `z.string().min(1)`.
- `AuthResponseSchema`:
  - `accessToken`: `z.string()`.
  - `user`: `{ id: string, email: string, role: 'USER' | 'ADMIN' }`.
- `UserSummarySchema`: `{ id: string, email: string, role: 'USER' | 'ADMIN', createdAt: string }`.

### 3.2 Catalog Schemas
- `CursorPaginationQuerySchema`:
  - `type`: `z.enum(['AUDIO', 'VIDEO']).optional()`.
  - `limit`: `z.coerce.number().int().min(1).max(50).default(20)`.
  - `cursor`: `z.string().optional()` (Base64-encoded `{ publishedAt: string, id: string }`).
- `PaginatedMediaResponseSchema`:
  - `items`: `z.array(MediaItemSchema)`.
  - `nextCursor`: `z.string().nullable()`.
  - `hasMore`: `z.boolean()`.
- `MediaDetailSchema`: Extends `MediaItemSchema` with:
  - `album`: `{ id: string, title: string, slug: string } | null`.
  - `artists`: `z.array({ id: string, name: string, slug: string, role: 'MAIN' | 'FEATURED' | 'PRODUCER' })`.
- `SearchQuerySchema`:
  - `q`: `z.string().min(1).max(100)`.
  - `type`: `z.enum(['AUDIO', 'VIDEO']).optional()`.
  - `limit`: `z.coerce.number().int().min(1).max(50).default(20)`.
- `AdminCreateMediaSchema`:
  - `type`: `z.enum(['AUDIO', 'VIDEO'])`.
  - `title`: `z.string().min(1).max(255)`.
  - `slug`: `z.string().min(1).max(255)`.
  - `durationMs`: `z.number().int().nonnegative().optional()`.
  - `albumId`: `z.string().uuid().optional()`.
  - `artistIds`: `z.array(z.object({ artistId: z.string().uuid(), role: z.enum(['MAIN', 'FEATURED', 'PRODUCER']).default('MAIN') })).optional()`.
- `AdminUpdateMediaSchema`: Partial of `AdminCreateMediaSchema` plus `status: z.enum(['DRAFT', 'READY']).optional()`.

---

## 4. Backend Architecture & Security Policies

### 4.1 Token & Password Architecture
1. **Password Hashing:**
   - Library: `@node-rs/argon2` or native `argon2id`.
   - Salt: 16 bytes cryptographic random.
   - Cost parameters: Memory 64MB (65536 KB), 3 iterations, 4 parallelism (OWASP recommendation).
2. **Access Token (JWT):**
   - Lifespan: 15 minutes.
   - Payload: `{ sub: user.id, email: user.email, role: user.role }`.
   - Signing Algorithm: HS256 with `JWT_SECRET` (minimum 32 characters).
   - Delivered in JSON body; sent by client via `Authorization: Bearer <token>`.
3. **Refresh Token (Opaque Token):**
   - Generation: 32 bytes cryptographically secure random (`crypto.randomBytes(32).toString('hex')`).
   - Storage in DB: `token_hash = sha256(raw_token)`. Plaintext token is never stored in DB.
   - Lifespan: 7 days.
   - Delivery: `Set-Cookie` with attributes:
     - `HttpOnly`: true (inaccessible to JavaScript document.cookie).
     - `Secure`: true (in production / HTTPS; configurable in local dev).
     - `SameSite`: `'Lax'`.
     - `Path`: `'/v1/auth'`.
     - `Max-Age`: `7 * 24 * 60 * 60`.

### 4.2 Security Workflows & Guards
1. **Token Rotation on Refresh (`POST /v1/auth/refresh`):**
   - Extract raw token from cookie.
   - Compute `hash = sha256(raw_token)`.
   - Query `refresh_sessions` by `token_hash`:
     - If not found or expired (`expires_at < now()`): throw `401 Unauthorized`.
     - If `revoked_at IS NOT NULL` (**Reuse Detection Trigger**):
       - Log security alert.
       - Revoke **ALL** active refresh sessions belonging to `user_id`.
       - Clear cookie.
       - Throw `401 Unauthorized`.
     - If valid and active:
       - Update existing session `revoked_at = now()`.
       - Generate new refresh token, insert new `refresh_sessions` row.
       - Sign new access token.
       - Set new cookie and return new access token.
2. **Login Rate Limiter:**
   - In-memory or Fastify rate limiter tracking login attempts by IP/email.
   - Maximum 5 failed attempts per 1 minute window. Returns `429 Too Many Requests`.
3. **`AuthGuard`:**
   - Applied globally or per-controller.
   - Skips routes decorated with `@Public()`.
   - Validates Bearer token; injects `req.user` payload.
4. **`RolesGuard`:**
   - Reads `@Roles(...)` metadata.
   - Compares required roles with `req.user.role`.
   - Throws `403 Forbidden` if unauthorized.

---

## 5. API Endpoints Specification

### 5.1 Auth Endpoints (`/v1/auth`)
| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/auth/register` | Public | Create new user, generate tokens, set cookie |
| `POST` | `/v1/auth/login` | Public | Verify credentials (rate-limited), issue tokens, set cookie |
| `POST` | `/v1/auth/refresh` | Cookie | Rotate refresh token, issue new access token |
| `POST` | `/v1/auth/logout` | Cookie | Revoke current session, clear cookie |
| `GET` | `/v1/auth/me` | Bearer | Return authenticated user profile |

### 5.2 Catalog Endpoints (`/v1/media`, `/v1/search`)
| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/media` | Public | Keyset-paginated catalog of `READY` media |
| `GET` | `/v1/media/:id` | Public / Optional | Media detail with album and artists. Only `READY` for public |
| `GET` | `/v1/search` | Public | Case-insensitive title and artist search |

### 5.3 Admin Endpoints (`/v1/admin/media`)
| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/admin/media` | Admin | Create media item (default `DRAFT`) |
| `GET` | `/v1/admin/media` | Admin | List all media items (both `DRAFT` and `READY`) |
| `PATCH` | `/v1/admin/media/:id` | Admin | Update media metadata, artists, or status (`READY`) |
| `DELETE` | `/v1/admin/media/:id` | Admin | Remove media metadata and associations |

---

## 6. Frontend Integration (`frontend/apps/web`)

1. **Authentication State:**
   - Client-side Auth Context / Hook (`useAuth()`) maintaining Access Token in memory.
   - Automatically attempts silent refresh (`POST /v1/auth/refresh`) on initial page load if refresh cookie is present.
2. **Catalog Infinite / Cursor Pagination:**
   - Displays media cards.
   - "Load More" button or intersection observer requesting `GET /v1/media?cursor=<nextCursor>`.
3. **Navigation & Role Bar:**
   - Displays User Profile / Role badge (USER / ADMIN) when logged in.
   - Admin navigation tab to view/edit drafts if user role is `ADMIN`.

---

## 7. Educational Experiments & Performance Benchmarks

### 7.1 Experiment 1: Registration Concurrency & Uniqueness Invariant
- **Setup:** Send 2 concurrent requests with identical email `race@example.com` simultaneously using `Promise.all`.
- **Expected Outcome:**
  - Application-level `findByEmail` check fails to prevent race condition.
  - PostgreSQL unique index on `lower(trim(email))` catches the duplicate and rejects it with error code `23505`.
  - Backend catches code `23505` and returns HTTP `409 Conflict`.
  - Exactly 1 record is created in `users` table.

### 7.2 Experiment 2: Keyset Cursor vs. OFFSET Benchmark (10,000 Records)
- **Setup:** Synthetic seed script inserting 10,000 media items into PostgreSQL with sequential timestamps.
- **Measurements via `EXPLAIN (ANALYZE, BUFFERS)`:**
  1. Deep Pagination with `OFFSET`: `SELECT * FROM media WHERE status = 'READY' ORDER BY published_at DESC, id DESC OFFSET 9980 LIMIT 20;`
     - Observe: Buffer reads (`shared read/hit`), execution time, full index/table scan cost.
  2. Deep Pagination with Keyset Cursor: `SELECT * FROM media WHERE status = 'READY' AND (published_at, id) < ($cursor_published_at, $cursor_id) ORDER BY published_at DESC, id DESC LIMIT 20;`
     - Observe: Index Condition Seek, constant buffer reads (typically 3–5 buffers), sub-millisecond execution time (`O(1)`).
- **Deliverable:** Benchmark report in `docs/experiments/002-keyset-pagination-benchmark.md`.

---

## 8. Definition of Done (Acceptance Criteria)
1. **Migrations:** Schema updated with `users`, `refresh_sessions`, `artists`, `albums`, `media_artists`, and composite indexes cleanly applied.
2. **Auth & RBAC:**
   - Signup, Login, Refresh, Logout, and `/auth/me` work with Argon2id and JWT/Cookie tokens.
   - Token reuse detection revokes all sessions on replay of old refresh token.
   - Role guard returns 401 on missing auth, 403 on non-admin accessing admin routes.
3. **Catalog & Pagination:**
   - `GET /v1/media` uses keyset pagination without missing or duplicating items.
   - `GET /v1/search` and `GET /v1/media/:id` return relational metadata.
   - Admin CRUD allows creating, updating, and publishing media.
4. **Testing:**
   - Comprehensive unit and integration tests (Testcontainers PostgreSQL) passing 100%.
   - Race condition registration test passing.
   - Pagination correctness tests passing.
5. **Quality & Evidence:**
   - ADR-002 committed in `docs/adr/002-token-and-session-strategy.md`.
   - Benchmark experiment report in `docs/experiments/002-keyset-pagination-benchmark.md`.
   - `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass with 0 errors.
