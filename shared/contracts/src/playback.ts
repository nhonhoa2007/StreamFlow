import { z } from "zod";

export const StartPlaybackResponseSchema = z.object({
  sessionId: z.string().uuid(),
  mediaId: z.string().uuid(),
  positionMs: z.number().int().nonnegative(),
});
export type StartPlaybackResponse = z.infer<typeof StartPlaybackResponseSchema>;

export const UpdateProgressSchema = z.object({
  sequence: z.number().int().positive("sequence must be a positive integer"),
  positionMs: z.number().int().nonnegative("positionMs must be non-negative"),
  playedAt: z.string().datetime().optional(),
});
export type UpdateProgress = z.infer<typeof UpdateProgressSchema>;

export const ProgressResponseSchema = z.object({
  status: z.enum(["updated", "ignored"]),
  reason: z.string().optional(),
  positionMs: z.number().int().nonnegative(),
  lastSequence: z.number().int().nonnegative(),
});
export type ProgressResponse = z.infer<typeof ProgressResponseSchema>;
