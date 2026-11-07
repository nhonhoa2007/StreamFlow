import type { ProgressResponse, UpdateProgress } from "@streamflow/contracts";
type Result = { data?: ProgressResponse; error?: string };
export class ProgressSync {
  private sequence = 0;
  private pending: number | null = null;
  private running: Promise<void> | null = null;
  constructor(
    private readonly save: (payload: UpdateProgress) => Promise<Result>,
    private readonly onError: () => void,
  ) {}
  push(positionMs: number): Promise<void> {
    this.pending = positionMs;
    if (!this.running)
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    return this.running;
  }
  private async drain() {
    while (this.pending !== null) {
      let positionMs = this.pending;
      this.pending = null;
      let result = await this.save({ sequence: ++this.sequence, positionMs });
      if (result.data?.status === "ignored") {
        this.sequence = Math.max(this.sequence, result.data.lastSequence);
        positionMs = this.pending ?? positionMs;
        this.pending = null;
        result = await this.save({ sequence: ++this.sequence, positionMs });
      }
      if (result.error || result.data?.status === "ignored") this.onError();
      if (result.data) this.sequence = Math.max(this.sequence, result.data.lastSequence);
    }
  }
}
