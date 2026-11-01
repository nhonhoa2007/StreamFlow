import { type DynamicModule, Module } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../health/health.controller.js";
import { MediaController } from "./media.controller.js";
import { MediaService } from "./media.service.js";

@Module({})
export class MediaModule {
  static register(databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: MediaModule,
      controllers: [MediaController],
      providers: [
        MediaService,
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
      ],
      exports: [MediaService],
    };
  }
}
