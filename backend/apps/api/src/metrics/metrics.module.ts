import { type DynamicModule, Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";
import { MetricsController } from "./metrics.controller.js";
import { MetricsInterceptor } from "./metrics.interceptor.js";
import { MetricsService } from "./metrics.service.js";

@Global()
@Module({})
export class MetricsModule {
  static register(databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: MetricsModule,
      controllers: [MetricsController],
      providers: [
        MetricsService,
        {
          provide: DATABASE_HANDLE_TOKEN,
          useValue: databaseHandle,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: MetricsInterceptor,
        },
      ],
      exports: [MetricsService],
    };
  }
}
