import type { RenditionProfile } from "@streamflow/contracts";

export interface StandardRendition {
  name: string;
  width: number;
  height: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}

const CANDIDATE_RENDITIONS: StandardRendition[] = [
  {
    name: "1080p",
    width: 1920,
    height: 1080,
    videoBitrateKbps: 4500,
    audioBitrateKbps: 192,
  },
  {
    name: "720p",
    width: 1280,
    height: 720,
    videoBitrateKbps: 2200,
    audioBitrateKbps: 128,
  },
  {
    name: "360p",
    width: 640,
    height: 360,
    videoBitrateKbps: 800,
    audioBitrateKbps: 96,
  },
];

export function buildRenditionLadder(
  _sourceWidth: number,
  sourceHeight: number,
  mediaId: string,
): RenditionProfile[] {
  // Strict No-Upscaling Invariant: Only include profiles where profile.height <= sourceHeight
  const eligible = CANDIDATE_RENDITIONS.filter((r) => r.height <= sourceHeight);

  // If source is smaller than 360p, ensure at least 360p exists as baseline
  const selected = eligible.length > 0 ? eligible : [CANDIDATE_RENDITIONS[2]];

  return selected.map((r) => ({
    name: r.name,
    width: r.width,
    height: r.height,
    videoBitrateKbps: r.videoBitrateKbps,
    audioBitrateKbps: r.audioBitrateKbps,
    playlistKey: `hls/${mediaId}/${r.name}.m3u8`,
  }));
}

export function generateMasterPlaylistContent(ladder: RenditionProfile[]): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];

  for (const rendition of ladder) {
    const totalBandwidth = (rendition.videoBitrateKbps + rendition.audioBitrateKbps) * 1000;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${totalBandwidth},RESOLUTION=${rendition.width}x${rendition.height},NAME="${rendition.name}"`,
    );
    lines.push(`${rendition.name}.m3u8`);
  }

  return `${lines.join("\n")}\n`;
}
