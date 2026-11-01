import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
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

  @Get(":id")
  async getDetail(@Param("id") id: string) {
    return this.mediaService.getDetail(id);
  }
}

@Public()
@Controller("v1/search")
export class SearchController {
  constructor(
    @Inject(MediaService)
    private readonly mediaService: MediaService,
  ) {}

  @Get()
  async search(@Query() query: Record<string, unknown>) {
    return this.mediaService.search(query);
  }
}
