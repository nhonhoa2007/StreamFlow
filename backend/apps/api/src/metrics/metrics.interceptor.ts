import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { type Observable, tap } from "rxjs";
import { MetricsService } from "./metrics.service.js";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @Inject(MetricsService)
    private readonly metricsService: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const start = performance.now();

    let recorded = false;
    const record = (status: number) => {
      if (recorded) return;
      recorded = true;
      const duration = (performance.now() - start) / 1000;
      const method = req.method || "GET";
      const route = req.routeOptions?.url || (req.url ? req.url.split("?")[0] : "/");
      this.metricsService.recordHttpRequest(method, route, status, duration);
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const res = http.getResponse();
          record(res.statusCode || 200);
        },
        error: (err: { status?: number; statusCode?: number }) => {
          const status = err?.status || err?.statusCode || 500;
          record(status);
        },
      }),
    );
  }
}
