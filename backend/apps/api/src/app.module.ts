import fastifyCookie from "@fastify/cookie";
import { type DynamicModule, Module, type Type } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { ApiEnv } from "@streamflow/config";
import type { DatabaseHandle } from "@streamflow/database";
import { createLogger, validateOrGenerateRequestId } from "@streamflow/logger";
import { AdminModule } from "./admin/admin.module.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { RolesGuard } from "./auth/roles.guard.js";
import { CacheModule } from "./cache/cache.module.js";
import { API_CONFIG_TOKEN } from "./constants.js";
import { ExperimentsModule } from "./experiments/experiments.module.js";
import { HealthModule } from "./health/health.module.js";
import { LibraryModule } from "./library/library.module.js";
import { MediaModule } from "./media/media.module.js";
import { MetricsModule } from "./metrics/metrics.module.js";
import { PlaybackModule } from "./playback/playback.module.js";
import { PlaylistModule } from "./playlist/playlist.module.js";
import { QueueModule } from "./queue/queue.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { UploadModule } from "./upload/upload.module.js";

export { API_CONFIG_TOKEN };

@Module({})
export class AppModule {
  static forRoot(config: ApiEnv, databaseHandle: DatabaseHandle): DynamicModule {
    const imports: (Type<unknown> | DynamicModule)[] = [
      CacheModule.register(config),
      QueueModule.register(config, databaseHandle),
      MetricsModule.register(databaseHandle),
      HealthModule.register(databaseHandle),
      MediaModule.register(databaseHandle),
      AuthModule.register(config, databaseHandle),
      AdminModule.register(databaseHandle),
      LibraryModule.register(databaseHandle),
      PlaylistModule.register(databaseHandle),
      PlaybackModule.register(config, databaseHandle),
      StorageModule.register(config),
      UploadModule.register(config, databaseHandle),
    ];

    if (config.NODE_ENV !== "production") {
      imports.push(ExperimentsModule);
    }

    return {
      module: AppModule,
      imports,
      providers: [
        {
          provide: API_CONFIG_TOKEN,
          useValue: config,
        },
        {
          provide: APP_GUARD,
          useClass: AuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: RolesGuard,
        },
      ],
      exports: [API_CONFIG_TOKEN],
    };
  }
}

export type BuildAppConfig = Partial<ApiEnv> & {
  DATABASE_URL: string;
  JWT_SECRET: string;
};

export async function buildApp(
  configInput: BuildAppConfig,
  databaseHandle: DatabaseHandle,
): Promise<NestFastifyApplication> {
  const config: ApiEnv = {
    NODE_ENV: configInput.NODE_ENV ?? "development",
    PORT: configInput.PORT ?? 3000,
    DATABASE_URL: configInput.DATABASE_URL,
    JWT_SECRET: configInput.JWT_SECRET,
    REDIS_URL: configInput.REDIS_URL ?? "redis://127.0.0.1:6379",
    CACHE_TTL_SECONDS: configInput.CACHE_TTL_SECONDS ?? 60,
    TRANSCODE_QUEUE_NAME: configInput.TRANSCODE_QUEUE_NAME ?? "media-transcode-queue",
    TRANSCODE_CONCURRENCY: configInput.TRANSCODE_CONCURRENCY ?? 2,
    TRANSCODE_MAX_ATTEMPTS: configInput.TRANSCODE_MAX_ATTEMPTS ?? 3,
    KAFKA_BROKERS: configInput.KAFKA_BROKERS ?? "127.0.0.1:9092",
    KAFKA_PLAYBACK_TOPIC: configInput.KAFKA_PLAYBACK_TOPIC ?? "media-playback-events",
    KAFKA_CONSUMER_GROUP: configInput.KAFKA_CONSUMER_GROUP ?? "streamflow-analytics-group",
    STORAGE_PROVIDER: configInput.STORAGE_PROVIDER,
    STORAGE_ENDPOINT: configInput.STORAGE_ENDPOINT,
    STORAGE_BUCKET_NAME: configInput.STORAGE_BUCKET_NAME,
    STORAGE_ACCESS_KEY_ID: configInput.STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY: configInput.STORAGE_SECRET_ACCESS_KEY,
    STORAGE_PUBLIC_URL: configInput.STORAGE_PUBLIC_URL,
  };

  const logger = createLogger({
    level: config.NODE_ENV === "test" ? "silent" : "info",
  });

  const adapter = new FastifyAdapter();
  const fastifyInstance = adapter.getInstance();

  await fastifyInstance.register(fastifyCookie as never);

  fastifyInstance.addHook("onRequest", async (req, reply) => {
    const incomingHeader = req.headers["x-request-id"];
    const requestId = validateOrGenerateRequestId(
      typeof incomingHeader === "string" ? incomingHeader : undefined,
    );
    (req as unknown as { id: string }).id = requestId;
    reply.header("x-request-id", requestId);
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config, databaseHandle),
    adapter,
    {
      abortOnError: false,
      logger: config.NODE_ENV === "test" ? false : ["error", "warn", "log"],
    },
  );

  app.enableShutdownHooks();

  return app;
}
