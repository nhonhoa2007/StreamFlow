import { type DynamicModule, Module } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { API_CONFIG_TOKEN, DATABASE_HANDLE_TOKEN } from "../constants.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

@Module({})
export class AuthModule {
  static register(
    config: { JWT_SECRET: string; NODE_ENV: string },
    databaseHandle: DatabaseHandle,
  ): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
        {
          provide: API_CONFIG_TOKEN,
          useValue: config,
        },
      ],
      exports: [AuthService],
    };
  }
}
