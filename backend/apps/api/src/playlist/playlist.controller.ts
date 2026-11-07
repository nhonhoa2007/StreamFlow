import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  AddPlaylistItemSchema,
  CreatePlaylistSchema,
  ReorderPlaylistItemsSchema,
  UpdatePlaylistSchema,
} from "@streamflow/contracts";
import type { FastifyRequest } from "fastify";
import type { RequestUser } from "../auth/auth.guard.js";
import { PlaylistService } from "./playlist.service.js";

@Controller("v1/playlists")
export class PlaylistController {
  constructor(
    @Inject(PlaylistService)
    private readonly playlistService: PlaylistService,
  ) {}

  private getUserId(req: FastifyRequest): string {
    const user = (req as unknown as { user?: RequestUser }).user;
    if (!user?.sub) {
      throw new BadRequestException("User context not available");
    }
    return user.sub;
  }

  @Post()
  async create(@Body() body: Record<string, unknown>, @Req() req: FastifyRequest) {
    const parsed = CreatePlaylistSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const userId = this.getUserId(req);
    return this.playlistService.create(userId, parsed.data);
  }

  @Get()
  async list(@Req() req: FastifyRequest) {
    const userId = this.getUserId(req);
    return this.playlistService.list(userId);
  }

  @Get(":id")
  async getDetail(@Param("id") id: string, @Req() req: FastifyRequest) {
    const userId = this.getUserId(req);
    return this.playlistService.getDetail(id, userId);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
  ) {
    const parsed = UpdatePlaylistSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    return this.playlistService.update(id, this.getUserId(req), parsed.data);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async delete(@Param("id") id: string, @Req() req: FastifyRequest) {
    return this.playlistService.delete(id, this.getUserId(req));
  }

  @Post(":id/items")
  async addItem(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
  ) {
    const parsed = AddPlaylistItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const userId = this.getUserId(req);
    return this.playlistService.addItem(id, userId, parsed.data.mediaId);
  }

  @Delete(":id/items/:itemId")
  @HttpCode(HttpStatus.OK)
  async removeItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.getUserId(req);
    return this.playlistService.removeItem(id, userId, itemId);
  }

  @Patch(":id/items/reorder")
  async reorder(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
  ) {
    const parsed = ReorderPlaylistItemsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const userId = this.getUserId(req);
    return this.playlistService.reorder(
      id,
      userId,
      parsed.data.expectedVersion,
      parsed.data.itemIds,
    );
  }
}
