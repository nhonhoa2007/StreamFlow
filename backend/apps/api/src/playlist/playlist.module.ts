import { type DynamicModule, Module } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";
import { PlaylistController } from "./playlist.controller.js";
import { PlaylistService } from "./playlist.service.js";

@Module({})
export class PlaylistModule {
  static register(databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: PlaylistModule,
      controllers: [PlaylistController],
      providers: [
        PlaylistService,
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
      ],
      exports: [PlaylistService],
    };
  }
}
