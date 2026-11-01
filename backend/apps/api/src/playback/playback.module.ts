import { type DynamicModule, Module } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";
import { PlaybackController } from "./playback.controller.js";
import { PlaybackService } from "./playback.service.js";

@Module({})
export class PlaybackModule {
  static register(databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: PlaybackModule,
      controllers: [PlaybackController],
      providers: [
        PlaybackService,
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
      ],
      exports: [PlaybackService],
    };
  }
}
