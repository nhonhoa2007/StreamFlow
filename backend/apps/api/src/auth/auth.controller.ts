import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { LoginRequestSchema, RegisterRequestSchema } from "@streamflow/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { API_CONFIG_TOKEN } from "../constants.js";
import { AuthService } from "./auth.service.js";

const COOKIE_NAME = "refresh_token";

@Controller("v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(API_CONFIG_TOKEN)
    private readonly config: { NODE_ENV: string },
  ) {}

  private setRefreshTokenCookie(reply: FastifyReply, token: string) {
    const isProduction = this.config.NODE_ENV === "production";
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/v1/auth",
      maxAge: 7 * 24 * 60 * 60,
    });
  }

  private clearRefreshTokenCookie(reply: FastifyReply) {
    reply.clearCookie(COOKIE_NAME, {
      path: "/v1/auth",
    });
  }

  @Post("register")
  async register(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const parsed = RegisterRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const { response, rawRefreshToken } = await this.authService.register(parsed.data);
    this.setRefreshTokenCookie(reply, rawRefreshToken);
    return response;
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const { response, rawRefreshToken } = await this.authService.login(parsed.data);
    this.setRefreshTokenCookie(reply, rawRefreshToken);
    return response;
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const rawToken = req.cookies?.[COOKIE_NAME];
    const { response, rawRefreshToken } = await this.authService.refresh(rawToken);
    this.setRefreshTokenCookie(reply, rawRefreshToken);
    return response;
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const rawToken = req.cookies?.[COOKIE_NAME];
    await this.authService.logout(rawToken);
    this.clearRefreshTokenCookie(reply);
    return { status: "ok" };
  }

  @Get("me")
  async getMe(@Req() req: FastifyRequest) {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user?.sub) {
      throw new BadRequestException("User context not available");
    }
    return this.authService.getMe(user.sub);
  }
}
