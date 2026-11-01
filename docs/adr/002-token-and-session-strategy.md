# ADR-002: Token & Session Management Strategy

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

A streaming/VOD platform requires secure, low-latency authentication for both web clients and background services. Three architectural options were evaluated:

1. **Option A: Pure Stateful Server-Side Sessions (Redis / DB Session Lookup):**
   - Every request queries database or Redis to check session validity.
   - *Downside:* Incurred database/cache round-trips on every request; complicates distributed replicas (M08).
2. **Option B: Pure Stateless Long-Lived JWT in Browser LocalStorage:**
   - Single long-lived JWT (e.g., 30 days) stored in browser `localStorage`.
   - *Downside:* Vulnerable to XSS token theft (any malicious injected script can exfiltrate the token); cannot revoke tokens before expiration without complex blacklists.
3. **Option C: Hybrid Short-Lived JWT Access Token + HttpOnly Refresh Token in DB:**
   - Access token (JWT, 15 minutes) passed in `Authorization: Bearer <token>` header, held in frontend memory.
   - Refresh token (opaque 32-byte random hex) stored as SHA-256 hash in PostgreSQL `refresh_sessions`, transmitted via `HttpOnly; SameSite=Lax; Path=/v1/auth` cookie.

---

## Decision

We decide on **Option C (Hybrid Token Architecture)** with **Token Reuse Detection**:
1. **Password Hashing:** Argon2id with OWASP recommended cost parameters (64 MB memory, 3 iterations, 4 parallelism).
2. **Access Token:** Short-lived JWT (15 minutes) carrying `{ sub, email, role }` verified locally by `AuthGuard` without database queries.
3. **Refresh Token Storage:** The raw 64-character token is never stored in PostgreSQL. Only its SHA-256 hash (`token_hash`) is persisted.
4. **Token Rotation:** Each call to `POST /v1/auth/refresh` revokes the old refresh token and issues a brand new refresh token and access token.
5. **Reuse Detection (Session Hijacking Defense):** If a client attempts to refresh using a token that was already marked revoked (`revoked_at IS NOT NULL`), the system treats the session as compromised and **immediately revokes all active sessions** for that user.

---

## Consequences

### Positive
- **XSS Protection:** Refresh tokens are protected inside HttpOnly cookies inaccessible to browser JavaScript.
- **Low Request Latency:** API endpoints verify access tokens statelessly in memory (`<0.05ms`) without touching the database.
- **Immediate Revocability:** If an account is breached or a device is lost, calling `revokeAllSessionsForUser` invalidates all refresh tokens instantly.
- **Replay Protection:** Replaying an old intercepted refresh token destroys the attacker's and victim's sessions, locking out unauthorized access and triggering security alerts.

### Negative / Tradeoffs
- **CSRF Consideration:** Using cookies for refresh requires `SameSite=Lax` and restricting cookie scope strictly to `/v1/auth`.
- **Database Writes on Refresh:** Once every 15 minutes per active user, a database transaction rotates the session row. (Acceptable load given 15-minute interval).
