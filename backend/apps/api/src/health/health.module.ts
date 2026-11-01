import { type DynamicModule, Module } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN, HealthController } from "./health.controller.js";

@Module({})
export class HealthModule {
  static register(databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
      ],
      exports: [DATABASE_HANDLE_TOKEN],
    };
  }
}
