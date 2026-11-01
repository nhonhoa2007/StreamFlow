import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { InitUploadRequestSchema } from "@streamflow/contracts";
import type { FastifyRequest } from "fastify";
import type { RequestUser } from "../auth/auth.guard.js";
import { Roles } from "../auth/roles.decorator.js";
import { UploadService } from "./upload.service.js";

@Roles("ADMIN")
@Controller("v1/admin/uploads")
export class UploadController {
  constructor(
    @Inject(UploadService)
    private readonly uploadService: UploadService,
  ) {}

  private getUserId(req: FastifyRequest): string {
    const user = (req as unknown as { user?: RequestUser }).user;
    if (!user?.sub) {
      throw new BadRequestException("User context not available");
    }
    return user.sub;
  }

  @Post("init")
  async init(@Body() body: Record<string, unknown>, @Req() req: FastifyRequest) {
    const parsed = InitUploadRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const userId = this.getUserId(req);
    return this.uploadService.init(userId, parsed.data);
  }

  @Post(":id/complete")
  @HttpCode(HttpStatus.OK)
  async complete(@Param("id") uploadId: string) {
    return this.uploadService.complete(uploadId);
  }

  @Get(":id")
  async getSession(@Param("id") uploadId: string) {
    return this.uploadService.getSession(uploadId);
  }

  @Post("cleanup")
  @HttpCode(HttpStatus.OK)
  async cleanup() {
    return this.uploadService.cleanupExpired();
  }
}
