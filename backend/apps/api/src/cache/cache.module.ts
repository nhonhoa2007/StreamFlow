import { type DynamicModule, Global, Module } from "@nestjs/common";
import { API_CONFIG_TOKEN } from "../constants.js";
import { CacheService } from "./cache.service.js";

@Global()
@Module({})
export class CacheModule {
  static register(config: unknown): DynamicModule {
    return {
      module: CacheModule,
      providers: [
        CacheService,
        {
          provide: API_CONFIG_TOKEN,
          useValue: config,
        },
      ],
      exports: [CacheService],
    };
  }
}
