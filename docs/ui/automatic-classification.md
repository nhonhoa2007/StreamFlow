# Automatic media classification

StreamFlow classifies uploaded media from the metadata embedded in the source
file. Classification runs in the media worker after `ffprobe` has produced a
normalized probe result. It is deterministic, bounded, and does not make a
network request or infer a genre from a title, artist, filename, waveform, or
artwork.

## Labels

Video receives one technical label from its largest video dimension:

- `video-4k` for dimensions at least 2160 pixels.
- `video-hd` for dimensions at least 720 pixels and below 2160.
- `video-sd` for smaller or missing dimensions when a video stream exists.

Audio receives one codec label when an audio stream and codec are available:

- `audio-lossless` for FLAC, ALAC, and PCM codecs.
- `audio-lossy` for other recognized audio codecs.

Embedded `genre` tags become additional labels. Genre values are split on
common separators, trimmed, lowercased, converted to slug-safe values, limited
to 64 characters, deduplicated, and sorted. Labels are returned with the
technical label first, followed by sorted genre labels. Missing or malformed
optional tags do not prevent publication.

Semantic genres require an embedded file tag. StreamFlow does not guess a
genre from other metadata or from the media content itself. A file without an
embedded `genre` tag therefore receives only its applicable technical label.

## Stored metadata and API behavior

The worker stores a versioned, normalized metadata object on the media record.
It includes safe fields such as container, duration, size, bitrate, dimensions,
codecs, sample rate, channel count, and normalized tags. Raw `ffprobe` output,
file paths, and arbitrary stream fields are not exposed to normal viewers.

Catalog, search, detail, library, and playlist media projections expose
`classificationLabels`. Clients treat a missing field as an empty list for
backward compatibility. Catalog and search can apply an exact normalized-label
filter while retaining the existing cursor ordering and pagination behavior.
The web card and details surfaces show up to three labels and an overflow count.

## Retries and idempotency

Video classification is included in the same transaction that publishes HLS
assets and marks the media `READY`. If probing fails in that pipeline, the
existing unrecoverable path leaves the media in `DRAFT` and marks the job
failed.

Audio and source-only uploads run a metadata-classification job after upload
completion. The job updates metadata and labels without changing publication
status. BullMQ retries worker failures. Re-running a job for the same media and
source asset replaces the normalized metadata and label array with the same
deterministic values, so duplicate completion requests and retries do not add
duplicate labels or change their order.

The persisted label array has a PostgreSQL GIN index for exact-label filters.
Existing media rows receive an empty label array and remain valid until their
source is classified.

