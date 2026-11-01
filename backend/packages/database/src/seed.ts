import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { mediaTable } from "./schema.js";

const SEED_MEDIA = [
  {
    type: "AUDIO" as const,
    title: "Cyber Drift",
    slug: "audio-cyber-drift",
    status: "READY" as const,
    durationMs: 184000,
  },
  {
    type: "AUDIO" as const,
    title: "Midnight Echoes",
    slug: "audio-midnight-echoes",
    status: "READY" as const,
    durationMs: 215000,
  },
  {
    type: "AUDIO" as const,
    title: "Neon Horizon",
    slug: "audio-neon-horizon",
    status: "READY" as const,
    durationMs: 160000,
  },
  {
    type: "AUDIO" as const,
    title: "Deep Frequency",
    slug: "audio-deep-frequency",
    status: "READY" as const,
    durationMs: 240000,
  },
  {
    type: "AUDIO" as const,
    title: "Solar Pulse",
    slug: "audio-solar-pulse",
    status: "READY" as const,
    durationMs: 198000,
  },
  {
    type: "VIDEO" as const,
    title: "Nature in Motion (Documentary)",
    slug: "video-nature-in-motion",
    status: "READY" as const,
    durationMs: 620000,
  },
  {
    type: "VIDEO" as const,
    title: "City Lights Timelapse",
    slug: "video-city-lights-4k",
    status: "READY" as const,
    durationMs: 450000,
  },
  {
    type: "VIDEO" as const,
    title: "Ocean Depths Adventure",
    slug: "video-ocean-depths",
    status: "READY" as const,
    durationMs: 780000,
  },
  {
    type: "VIDEO" as const,
    title: "Mountain Trails Expedition",
    slug: "video-mountain-trails",
    status: "READY" as const,
    durationMs: 510000,
  },
  {
    type: "VIDEO" as const,
    title: "Retro Synthetics Visualizer",
    slug: "video-retro-synthetics",
    status: "READY" as const,
    durationMs: 330000,
  },
];

export async function runSeed(connectionString: string): Promise<void> {
  const seedClient = postgres(connectionString, { max: 1 });
  const db = drizzle(seedClient);

  try {
    for (const item of SEED_MEDIA) {
      await db
        .insert(mediaTable)
        .values({
          type: item.type,
          title: item.title,
          slug: item.slug,
          status: item.status,
          durationMs: item.durationMs,
        })
        .onConflictDoUpdate({
          target: mediaTable.slug,
          set: {
            title: item.title,
            type: item.type,
            status: item.status,
            durationMs: item.durationMs,
            updatedAt: new Date(),
          },
        });
    }
  } finally {
    await seedClient.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/streamflow";
  runSeed(url)
    .then(() => {
      console.log("Database seeded successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
