import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UserSummary,
} from "@streamflow/contracts";
import {
  type DatabaseHandle,
  createRefreshSession,
  createUser,
  findSessionByTokenHash,
  findUserByEmail,
  findUserById,
  revokeAllSessionsForUser,
  revokeSession,
} from "@streamflow/database";
import jwt from "jsonwebtoken";
import { API_CONFIG_TOKEN, DATABASE_HANDLE_TOKEN } from "../constants.js";
import { generateOpaqueToken, hashPassword, hashToken, verifyPassword } from "./crypto.util.js";

export interface AuthSessionResult {
  response: AuthResponse;
  rawRefreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
    @Inject(API_CONFIG_TOKEN)
    private readonly config: { JWT_SECRET: string; NODE_ENV: string },
  ) {}

  private signAccessToken(user: { id: string; email: string; role: "USER" | "ADMIN" }): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      this.config.JWT_SECRET,
      {
        expiresIn: "15m",
      },
    );
  }

  async register(data: RegisterRequest): Promise<AuthSessionResult> {
    const passwordHash = await hashPassword(data.password);

    let user: Awaited<ReturnType<typeof createUser>>;
    try {
      user = await createUser(this.databaseHandle.db, {
        email: data.email,
        passwordHash,
        role: "USER",
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        throw new ConflictException("Email already registered");
      }
      throw err;
    }

    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await createRefreshSession(this.databaseHandle.db, {
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const accessToken = this.signAccessToken(user);

    return {
      response: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
      rawRefreshToken: rawToken,
    };
  }

  async login(data: LoginRequest): Promise<AuthSessionResult> {
    const user = await findUserByEmail(this.databaseHandle.db, data.email);
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const isMatch = await verifyPassword(user.passwordHash, data.password);
    if (!isMatch) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await createRefreshSession(this.databaseHandle.db, {
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const accessToken = this.signAccessToken(user);

    return {
      response: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
      rawRefreshToken: rawToken,
    };
  }

  async refresh(rawRefreshToken?: string): Promise<AuthSessionResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException("Refresh token missing");
    }

    const tokenHash = hashToken(rawRefreshToken);
    const session = await findSessionByTokenHash(this.databaseHandle.db, tokenHash);

    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (session.revokedAt !== null) {
      // Reuse detection: revoke all sessions for this user
      await revokeAllSessionsForUser(this.databaseHandle.db, session.userId);
      throw new UnauthorizedException("Token reuse detected. All sessions revoked.");
    }

    // Revoke current session
    await revokeSession(this.databaseHandle.db, session.id);

    const user = await findUserById(this.databaseHandle.db, session.userId);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // Issue new session
    const { rawToken, tokenHash: newTokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await createRefreshSession(this.databaseHandle.db, {
      userId: user.id,
      tokenHash: newTokenHash,
      expiresAt,
    });

    const accessToken = this.signAccessToken(user);

    return {
      response: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
      rawRefreshToken: rawToken,
    };
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      const session = await findSessionByTokenHash(this.databaseHandle.db, tokenHash);
      if (session && session.revokedAt === null) {
        await revokeSession(this.databaseHandle.db, session.id);
      }
    }
  }

  async getMe(userId: string): Promise<UserSummary> {
    const user = await findUserById(this.databaseHandle.db, userId);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
