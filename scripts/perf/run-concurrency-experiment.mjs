import { createDatabase } from "../../backend/packages/database/dist/src/client.js";
import { runMigrations } from "../../backend/packages/database/dist/src/migrate.js";
import { updatePlaybackProgressMonotonic } from "../../backend/packages/database/dist/src/playback-repository.js";
import { reorderPlaylistItemsWithOCC } from "../../backend/packages/database/dist/src/playlist-repository.js";
import { startTestDatabase } from "../../backend/packages/database/dist/test/test-helper.js";

export async function runConcurrencyExperiment(customDbUrl) {
  console.log("=== StreamFlow M03 Concurrency & Invariants Experiment ===");

  let testDbInstance = null;
  let dbUrl = customDbUrl || process.env.DATABASE_URL;

  if (!dbUrl) {
    console.log("No DATABASE_URL supplied; starting isolated PostgreSQL test instance...");
    testDbInstance = await startTestDatabase();
    dbUrl = testDbInstance.databaseUrl;
  }

  try {
    console.log("Applying migrations...");
    await runMigrations(dbUrl);
    const dbHandle = createDatabase(dbUrl);

    // Setup User and Media items
    const [user] = await dbHandle.client`
      INSERT INTO users (email, password_hash, role)
      VALUES (${`concurrency_${Date.now()}@example.com`}, 'hash', 'USER')
      RETURNING id;
    `;
    const userId = user.id;

    const mediaRows = await dbHandle.client`
      INSERT INTO media (type, title, slug, status)
      VALUES
        ('AUDIO', 'Conc Track 1', ${`conc-1-${Date.now()}`}, 'READY'),
        ('AUDIO', 'Conc Track 2', ${`conc-2-${Date.now()}`}, 'READY'),
        ('AUDIO', 'Conc Track 3', ${`conc-3-${Date.now()}`}, 'READY')
      RETURNING id;
    `;
    const [m1, m2, m3] = mediaRows;

    // Create Playlist
    const [pl] = await dbHandle.client`
      INSERT INTO playlists (owner_id, name, version)
      VALUES (${userId}::uuid, 'OCC Concurrency Playlist', 1)
      RETURNING id;
    `;
    const playlistId = pl.id;

    const itemRows = await dbHandle.client`
      INSERT INTO playlist_items (playlist_id, media_id, position)
      VALUES
        (${playlistId}::uuid, ${m1.id}::uuid, 0),
        (${playlistId}::uuid, ${m2.id}::uuid, 1),
        (${playlistId}::uuid, ${m3.id}::uuid, 2)
      RETURNING id;
    `;
    const [it1, it2, it3] = itemRows;

    // Part 1: 20 Concurrent Reorder Requests Targeting Same Version 1
    console.log("\n[1/2] Launching 20 concurrent reorder requests with OCC (Version 1)...");
    const reorderTasks = Array.from({ length: 20 }, (_, idx) => {
      const order = idx % 2 === 0 ? [it3.id, it1.id, it2.id] : [it2.id, it3.id, it1.id];
      return reorderPlaylistItemsWithOCC(dbHandle.client, playlistId, userId, 1, order)
        .then(() => ({ success: true }))
        .catch((err) => ({ success: false, error: err.message }));
    });

    const results = await Promise.all(reorderTasks);
    const successes = results.filter((r) => r.success).length;
    const conflicts = results.filter(
      (r) => !r.success && r.error === "PLAYLIST_VERSION_CONFLICT",
    ).length;

    console.log("OCC Reorder Results:");
    console.table([
      { Total: 20, "Success (Version incremented)": successes, "Conflicts (Rejected)": conflicts },
    ]);

    // Part 2: Out-of-order Telemetry
    console.log("\n[2/2] Testing Monotonic Telemetry Packet Invariant...");
    const [sess] = await dbHandle.client`
      INSERT INTO playback_sessions (user_id, media_id, last_sequence)
      VALUES (${userId}::uuid, ${m1.id}::uuid, 0)
      RETURNING id;
    `;
    const sessionId = sess.id;

    const seq1 = await updatePlaybackProgressMonotonic(
      dbHandle.client,
      sessionId,
      userId,
      1,
      30000,
    );
    const seq3 = await updatePlaybackProgressMonotonic(
      dbHandle.client,
      sessionId,
      userId,
      3,
      90000,
    );
    const seq2Stale = await updatePlaybackProgressMonotonic(
      dbHandle.client,
      sessionId,
      userId,
      2,
      60000,
    );

    console.log("Telemetry Sequence Results:");
    console.table([
      {
        Step: "Seq 1 (30s)",
        Status: seq1.status,
        PosMs: seq1.positionMs,
        LastSeq: seq1.lastSequence,
      },
      {
        Step: "Seq 3 (90s)",
        Status: seq3.status,
        PosMs: seq3.positionMs,
        LastSeq: seq3.lastSequence,
      },
      {
        Step: "Seq 2 (Delayed 60s)",
        Status: seq2Stale.status,
        PosMs: seq2Stale.positionMs,
        LastSeq: seq2Stale.lastSequence,
        Reason: seq2Stale.reason,
      },
    ]);

    await dbHandle.close();
    return { successes, conflicts, seq2Stale };
  } finally {
    if (testDbInstance) {
      await testDbInstance.cleanup();
    }
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runConcurrencyExperiment().catch((err) => {
    console.error("Experiment failed:", err);
    process.exit(1);
  });
}
