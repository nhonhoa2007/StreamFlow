# Automatic Media Classification — Design

**Date:** 2026-11-06  
**Status:** Implemented; PostgreSQL integration verification is blocked in this sandbox (`initdb EPERM`)

## Intent

StreamFlow should classify uploaded media from the file itself. The media worker already runs `ffprobe` before video publication, but it currently keeps the result in memory and only uses a small part of it for transcoding. This feature turns that probe into a durable, deterministic classification step that can be reused for video and audio uploads.

The first taxonomy is deliberately technical and explainable:

- `video-4k`, `video-hd`, or `video-sd` from the largest video dimension.
- `audio-lossless` or `audio-lossy` from the audio codec/container.
- Normalized embedded `genre` values when the file contains them.

The system will preserve a safe, normalized subset of the probed metadata for inspection and future rules. It will not claim to infer content genres when the file does not provide a genre tag.

## Goals

- Extract container, duration, size, bitrate, stream dimensions/codecs, sample rate, channel count, and embedded tags with `ffprobe`.
- Generate stable labels with pure, unit-testable rules.
- Persist normalized metadata and labels on the media record before a video becomes `READY`.
- Run the same classification worker for completed audio uploads so audio metadata is classified even when no video transcode is required.
- Return classification labels in public catalog/detail contracts and support exact-label filtering in catalog and search.
- Show labels as compact metadata badges in the existing media card and details surfaces.
- Keep classification deterministic, bounded, and safe when optional metadata is absent or malformed.

## Non-goals

- Machine-learning or external content recognition.
- Guessing a semantic genre from a title, artist name, waveform, or image.
- Admin CRUD for taxonomy labels; labels come from file metadata or fixed technical rules.
- Replacing the existing media type (`AUDIO`/`VIDEO`) or transcode pipeline.
- Making raw ffprobe output public or exposing file paths, arbitrary stream fields, or credentials.

## Anti-goals

- A failed optional tag must not prevent a valid media file from being published.
- The classifier must not make a network request or add a new runtime service.
- The API must not expose implementation-specific probe field names to normal viewers.
- Reprocessing the same source must not create duplicate labels or unstable ordering.

## Constraints

- The repository uses TypeScript, NestJS/Fastify, Drizzle/PostgreSQL, BullMQ, and Next.js.
- Existing uncommitted work in the workspace must remain intact.
- The current video pipeline publishes media atomically in `publishTranscodedMediaAtomic`; classification must be included in that publication transaction.
- Uploads retain source files in object storage and record their asset MIME type; workers may download the source before probing.
- `ffprobe` is already a runtime dependency of the media worker image and is invoked through `execFile`.
- Existing API consumers must remain compatible with responses that do not yet contain classification fields; contract parsers should default missing labels to an empty list.

## Approaches considered

### A. Classify synchronously in the API after upload completion

The API would download the uploaded object, invoke `ffprobe`, and write labels before returning from `POST /v1/admin/uploads/:id/complete`. This makes classification available immediately, but moves CPU and file I/O into the request path, duplicates worker behavior, and makes large uploads compete with API traffic.

### B. Classify in the media worker after probing — selected

The worker owns all file inspection. A completed upload enqueues a metadata classification job for audio and video source assets. The video transcode pipeline calls the same pure classifier after its probe and includes the metadata update in the atomic publish transaction. The classification job is idempotent and can be retried without creating duplicate state.

This keeps the API responsive, reuses the existing ffprobe runtime, and preserves the invariant that a video is not `READY` until its metadata and labels have been stored.

### C. Delegate classification to an external or ML service

This could infer richer semantic categories, but it adds network and operational dependencies and cannot provide reliable content genres from technical metadata alone. It is outside the approved scope and current product goals.

## Classification rules

`probeMedia` will return a normalized result with optional fields. The raw ffprobe response will not be persisted directly.

1. Read `format` fields: container name, duration, file size, bitrate, and format tags.
2. Read the first video and audio streams: dimensions, codec, bitrate, sample rate, channel count, and stream tags.
3. Normalize embedded genre tags from format or stream tags. Split common separators (`;`, `,`, `/`), trim whitespace, lowercase, convert runs of non-alphanumeric characters to `-`, discard empty values, cap each label at 64 characters, deduplicate, and sort. Only the `genre` tag is promoted to labels.
4. For video, classify by `max(width, height)`: `>= 2160` → `video-4k`; `>= 720` → `video-hd`; otherwise `video-sd`. Missing dimensions fall back to `video-sd` only when a video stream exists; invalid dimensions produce no technical label.
5. For audio, classify codecs `flac`, `alac`, and `pcm_*` as `audio-lossless`; other recognized audio codecs become `audio-lossy`. If no audio stream or codec is available, no audio label is emitted.
6. Return labels in a deterministic order: technical label first, then sorted normalized genre labels.

The persisted metadata shape is a versioned, bounded object:

```ts
{
  version: 1,
  container?: string,
  durationSeconds?: number,
  sizeBytes?: number,
  bitrateKbps?: number,
  width?: number,
  height?: number,
  videoCodec?: string,
  audioCodec?: string,
  sampleRateHz?: number,
  channels?: number,
  tags: Record<string, string>
}
```

Tag keys and values are trimmed and length-limited. Unknown ffprobe fields are ignored.

## Data model and transaction behavior

Add two nullable/defaulted fields to `media`:

- `metadata jsonb`: the normalized metadata object above, defaulting to `NULL` until a source has been probed.
- `classification_labels text[]`: generated labels, defaulting to an empty array with a GIN index for exact-label filters.

The migration must be additive and safe for existing rows. Existing seeded and test media receive `classification_labels = '{}'` and remain valid without metadata.

For video, `publishTranscodedMediaAtomic` accepts the normalized metadata and labels and updates the media row in the same transaction that inserts HLS assets, marks the media `READY`, and completes the transcode job. If ffprobe fails, the current unrecoverable failure path remains: the job is `FAILED` and the media stays `DRAFT`.

For audio and any source asset that is not part of a video transcode, upload completion enqueues an idempotent metadata-classification job on the media worker. The job updates metadata and labels but does not change the existing publication status. A classification error is retried by BullMQ and leaves the media in its current status; missing optional fields produce empty or partial labels rather than an error.

## Worker and queue interface

Add a discriminated metadata job payload to the shared contracts package with `mediaId`, `sourceAssetId`, and `sourceObjectKey`. The existing transcode payload remains compatible. The API queue service enqueues a classification job after a source asset is created; duplicate completion requests must not enqueue duplicate work.

The media worker handles metadata jobs using the same storage download and `probeMedia` code as the transcode pipeline. The classifier is a pure function so it can be tested without PostgreSQL, object storage, Redis, or ffmpeg. Video transcode may update the same row again with identical values; the write is idempotent.

## API contracts and queries

- Extend `MediaItem` with `classificationLabels: string[]` defaulting to `[]` during parsing.
- Extend `MediaDetail` with `classificationLabels` and normalized metadata only if the detail endpoint needs it for the admin/debug surface; the public viewer response should expose labels but not raw metadata.
- Add optional `classification` to catalog and search query schemas. It accepts one normalized label and rejects arrays, empty strings, and labels outside the slug-safe format.
- Apply exact-label filtering with PostgreSQL array containment while preserving the existing keyset ordering and cursor semantics.
- Include labels in catalog, search, detail, library, and playlist media projections wherever they reuse `MediaItem`.
- Version or invalidate existing catalog cache keys when classification filters/fields are introduced.

## Frontend behavior

- `media-api.ts` forwards the optional classification filter and parses labels with the shared contracts.
- Search URL state preserves `q`, `type`, and `classification` across navigation and pagination.
- Search displays a compact label filter derived from returned labels; no hardcoded genre list is required for the first release.
- `MediaCard` and `MediaDetails` render up to three labels, with an overflow count for additional labels. Labels are text, so color is not the only signal.
- Empty, loading, and error states retain their current behavior when no labels exist.

## Failure handling and observability

- `ffprobe` execution failures use the existing worker retry/unrecoverable distinction.
- Malformed optional values are omitted from normalized metadata and do not crash classification.
- Classification jobs are safe to retry and safe to run twice for the same media/source asset.
- Add structured worker log context for `mediaId`, `sourceAssetId`, probe duration, label count, and failure reason without logging file contents or raw tags.

## Success criteria

- A generated 4K, 720p, and SD video receive the expected mutually exclusive video label.
- FLAC/PCM/ALAC and AAC/MP3/Opus fixtures receive the expected audio label.
- Embedded genre tags are normalized, deduplicated, sorted, and returned in API responses.
- Re-running classification produces the same metadata and labels.
- A catalog/search request can filter by one exact label without changing pagination order.
- Video publication remains atomic and leaves media `DRAFT` when probing fails.
- Existing tests and clients continue to parse media without classification fields.

## Builder decisions left open

- Exact ffprobe field names and defensive parsing details are implementation choices as long as the normalized shape and rules above hold.
- The worker may use a dedicated metadata queue or a discriminated job on the existing queue; choose the smallest approach that preserves retry and idempotency.
- The public detail response should expose labels and may omit raw metadata; raw metadata is a persistence concern unless an existing admin surface requires it.
