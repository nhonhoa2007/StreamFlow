import { Controller, Get, Inject, Query } from "@nestjs/common";
import { Public } from "../auth/public.decorator.js";
import { MediaService } from "./media.service.js";

@Public()
@Controller("v1/media")
export class MediaController {
  constructor(
    @Inject(MediaService)
    private readonly mediaService: MediaService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, unknown>) {
    return this.mediaService.list(query);
  }
}
