import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { RequestUser } from "../auth/auth.guard.js";
import { LibraryService } from "./library.service.js";

@Controller()
export class LibraryController {
  constructor(
    @Inject(LibraryService)
    private readonly libraryService: LibraryService,
  ) {}

  private getUserId(req: FastifyRequest): string {
    const user = (req as unknown as { user?: RequestUser }).user;
    if (!user?.sub) {
      throw new BadRequestException("User context not available");
    }
    return user.sub;
  }

  @Post("v1/media/:id/favorite")
  @HttpCode(HttpStatus.OK)
  async addFavorite(@Param("id") mediaId: string, @Req() req: FastifyRequest) {
    const userId = this.getUserId(req);
    return this.libraryService.addFavorite(userId, mediaId);
  }

  @Delete("v1/media/:id/favorite")
  @HttpCode(HttpStatus.OK)
  async removeFavorite(@Param("id") mediaId: string, @Req() req: FastifyRequest) {
    const userId = this.getUserId(req);
    return this.libraryService.removeFavorite(userId, mediaId);
  }

  @Get("v1/library/favorites")
  async listFavorites(@Req() req: FastifyRequest) {
    const userId = this.getUserId(req);
    return this.libraryService.listFavorites(userId);
  }

  @Get("v1/library/continue")
  async getContinueWatching(@Req() req: FastifyRequest) {
    const userId = this.getUserId(req);
    return this.libraryService.getContinueWatching(userId);
  }

  @Get("v1/library/history")
  async getHistory(@Req() req: FastifyRequest) {
    return this.libraryService.getHistory(this.getUserId(req));
  }
}
