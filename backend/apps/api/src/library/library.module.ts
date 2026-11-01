import { type DynamicModule, Module } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";
import { LibraryController } from "./library.controller.js";
import { LibraryService } from "./library.service.js";

@Module({})
export class LibraryModule {
  static register(databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: LibraryModule,
      controllers: [LibraryController],
      providers: [
        LibraryService,
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
      ],
      exports: [LibraryService],
    };
  }
}
