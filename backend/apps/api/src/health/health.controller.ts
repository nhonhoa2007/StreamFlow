import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import type { FastifyReply } from "fastify";
import { Public } from "../auth/public.decorator.js";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";

export { DATABASE_HANDLE_TOKEN };

@Public()
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
  ) {}

  @Get("live")
  getLive() {
    return {
      status: "ok",
      uptime: process.uptime(),
    };
  }

  @Get("ready")
  async getReady(@Res({ passthrough: true }) res: FastifyReply) {
    const isConnected = await this.databaseHandle.checkConnection();
    if (!isConnected) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: "degraded",
        db: "disconnected",
      };
    }
    return {
      status: "ready",
      db: "connected",
    };
  }
}
