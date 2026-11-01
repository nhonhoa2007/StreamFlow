import { type DynamicModule, Module } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";
import { AdminTranscodeJobController } from "./admin-transcode-job.controller.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

@Module({})
export class AdminModule {
  static register(databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: AdminModule,
      controllers: [AdminController, AdminTranscodeJobController],
      providers: [
        AdminService,
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
      ],
      exports: [AdminService],
    };
  }
}
