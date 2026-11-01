import { type DynamicModule, Module } from "@nestjs/common";
import { API_CONFIG_TOKEN } from "../constants.js";
import { StorageService } from "./storage.service.js";

@Module({})
export class StorageModule {
  static register(config: unknown): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        StorageService,
        {
          provide: API_CONFIG_TOKEN,
          useValue: config,
        },
      ],
      exports: [StorageService],
    };
  }
}
