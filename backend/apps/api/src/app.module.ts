import { type DynamicModule, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { ApiEnv } from "@streamflow/config";
import type { DatabaseHandle } from "@streamflow/database";
import { createLogger, validateOrGenerateRequestId } from "@streamflow/logger";
import { HealthModule } from "./health/health.module.js";

export const API_CONFIG_TOKEN = "API_CONFIG";

@Module({})
export class AppModule {
  static forRoot(config: ApiEnv, databaseHandle: DatabaseHandle): DynamicModule {
    return {
      module: AppModule,
      imports: [HealthModule.register(databaseHandle)],
      providers: [
        {
          provide: API_CONFIG_TOKEN,
          useValue: config,
        },
      ],
      exports: [API_CONFIG_TOKEN],
    };
  }
}

export async function buildApp(
  config: ApiEnv,
  databaseHandle: DatabaseHandle
): Promise<NestFastifyApplication> {
  const logger = createLogger({
    level: config.NODE_ENV === "test" ? "silent" : "info",
  });

  const adapter = new FastifyAdapter();
  const fastifyInstance = adapter.getInstance();

  fastifyInstance.addHook("onRequest", async (req, reply) => {
    const incomingHeader = req.headers["x-request-id"];
    const requestId = validateOrGenerateRequestId(
      typeof incomingHeader === "string" ? incomingHeader : undefined
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
    }
  );

  app.enableShutdownHooks();

  return app;
}
