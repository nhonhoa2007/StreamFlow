import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator.js";
import { Roles } from "../auth/roles.decorator.js";

@Controller("test")
export class ExperimentsController {
  @Public()
  @Get("cpu-block")
  cpuBlock() {
    const start = Date.now();
    // Synchronous loop blocking event loop for 500ms for testing purposes
    while (Date.now() - start < 500) {}
    return {
      status: "blocked",
      durationMs: Date.now() - start,
    };
  }

  @Roles("ADMIN")
  @Get("admin-only")
  adminOnly() {
    return { status: "admin-ok" };
  }
}
