import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  width: number;
  height: number;
  durationSeconds: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrateKbps?: number;
}

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "stream=width,height,codec_name,codec_type,bit_rate",
    "-show_entries",
    "format=duration,size,bit_rate",
    "-of",
    "json",
    filePath,
  ];

  const { stdout } = await execFileAsync("ffprobe", args);
  const data = JSON.parse(stdout);

  const streams = data.streams || [];
  const videoStream = streams.find((s: { codec_type?: string }) => s.codec_type === "video");
  const audioStream = streams.find((s: { codec_type?: string }) => s.codec_type === "audio");

  const width = videoStream?.width ? Number(videoStream.width) : 640;
  const height = videoStream?.height ? Number(videoStream.height) : 360;

  const durationSeconds = data.format?.duration ? Number(data.format.duration) : 0;

  const formatBitrate = data.format?.bit_rate ? Number(data.format.bit_rate) : undefined;
  const videoBitrate = videoStream?.bit_rate ? Number(videoStream.bit_rate) : undefined;
  const bitrate = formatBitrate || videoBitrate;
  const bitrateKbps = bitrate ? Math.round(bitrate / 1000) : undefined;

  return {
    width,
    height,
    durationSeconds,
    videoCodec: videoStream?.codec_name,
    audioCodec: audioStream?.codec_name,
    bitrateKbps,
  };
}
