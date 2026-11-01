import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { UpdateProgressSchema } from "@streamflow/contracts";
import type { FastifyRequest } from "fastify";
import type { RequestUser } from "../auth/auth.guard.js";
import { PlaybackService } from "./playback.service.js";

@Controller()
export class PlaybackController {
  constructor(
    @Inject(PlaybackService)
    private readonly playbackService: PlaybackService,
  ) {}

  private getUserId(req: FastifyRequest): string {
    const user = (req as unknown as { user?: RequestUser }).user;
    if (!user?.sub) {
      throw new BadRequestException("User context not available");
    }
    return user.sub;
  }

  @Post("v1/playback/:id/start")
  async start(@Param("id") mediaId: string, @Req() req: FastifyRequest) {
    const userId = this.getUserId(req);
    return this.playbackService.start(userId, mediaId);
  }

  @Put("v1/playback/sessions/:id/progress")
  @HttpCode(HttpStatus.OK)
  async updateProgress(
    @Param("id") sessionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
  ) {
    const parsed = UpdateProgressSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const userId = this.getUserId(req);
    return this.playbackService.updateProgress(sessionId, userId, parsed.data);
  }
}
