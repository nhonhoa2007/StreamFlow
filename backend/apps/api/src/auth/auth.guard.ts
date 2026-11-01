import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import jwt from "jsonwebtoken";
import { API_CONFIG_TOKEN } from "../constants.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

export interface RequestUser {
  sub: string;
  email: string;
  role: "USER" | "ADMIN";
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(API_CONFIG_TOKEN)
    private readonly config: { JWT_SECRET: string },
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== "string") {
      throw new UnauthorizedException("Missing Authorization header");
    }

    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Invalid Authorization scheme");
    }

    try {
      const decoded = jwt.verify(token, this.config.JWT_SECRET) as RequestUser;
      request.user = decoded;
      return true;
    } catch (_err) {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
