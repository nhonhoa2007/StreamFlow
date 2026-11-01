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

    return next.handle().pipe(
      tap(() => {
        const res = http.getResponse();
        const duration = (performance.now() - start) / 1000;
        const method = req.method || "GET";
        const route = req.routeOptions?.url || req.url || "/";
        const status = res.statusCode || 200;
        this.metricsService.recordHttpRequest(method, route, status, duration);
      }),
    );
  }
}
