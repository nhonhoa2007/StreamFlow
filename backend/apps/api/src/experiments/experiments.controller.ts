import { Controller, Get } from "@nestjs/common";

@Controller("test")
export class ExperimentsController {
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
}
