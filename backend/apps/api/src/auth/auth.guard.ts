import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type DatabaseHandle, findUserById } from "@streamflow/database";
import jwt from "jsonwebtoken";
import { API_CONFIG_TOKEN, DATABASE_HANDLE_TOKEN } from "../constants.js";
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
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
      const decoded = jwt.verify(token, this.config.JWT_SECRET, {
        algorithms: ["HS256"],
      });
      if (
        typeof decoded !== "object" ||
        decoded === null ||
        typeof decoded.sub !== "string" ||
        typeof decoded.email !== "string" ||
        (decoded.role !== "USER" && decoded.role !== "ADMIN")
      ) {
        throw new Error("Invalid token claims");
      }
      const currentUser = await findUserById(this.databaseHandle.db, decoded.sub);
      if (!currentUser) {
        throw new UnauthorizedException("Invalid or expired token");
      }
      request.user = {
        sub: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
      } satisfies RequestUser;
      return true;
    } catch (_err) {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
