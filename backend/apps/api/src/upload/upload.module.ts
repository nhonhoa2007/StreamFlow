import { type DynamicModule, Module } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";
import { StorageModule } from "../storage/storage.module.js";
import { UploadController } from "./upload.controller.js";
import { UploadService } from "./upload.service.js";

@Module({})
export class UploadModule {
  static register(config: unknown, databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: UploadModule,
      imports: [StorageModule.register(config)],
      controllers: [UploadController],
      providers: [
        UploadService,
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
      ],
      exports: [UploadService, StorageModule],
    };
  }
}
