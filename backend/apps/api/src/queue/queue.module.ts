import { type DynamicModule, Global, Module } from "@nestjs/common";
import type { ApiEnv } from "@streamflow/config";
import type { DatabaseHandle } from "@streamflow/database";
import { API_CONFIG_TOKEN, DATABASE_HANDLE_TOKEN } from "../constants.js";
import { QueueService } from "./queue.service.js";

@Global()
@Module({})
export class QueueModule {
  static register(config: ApiEnv, databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: QueueModule,
      providers: [
        QueueService,
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
        {
          provide: API_CONFIG_TOKEN,
          useValue: config,
        },
      ],
      exports: [QueueService],
    };
  }
}
