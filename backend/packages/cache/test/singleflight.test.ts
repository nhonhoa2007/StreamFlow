import { describe, expect, it, vi } from "vitest";
import { Singleflight, calculateTtlWithJitter } from "../src/singleflight.js";

describe("Singleflight In-Flight Request Deduplication", () => {
  it("coalesces 50 concurrent calls for the same key so fn executes exactly once", async () => {
    const sf = new Singleflight();
    let executionCount = 0;

    const slowLoader = async () => {
      executionCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { data: "expensive_payload" };
    };

    const tasks = Array.from({ length: 50 }, () => sf.run("hot_cache_key", slowLoader));
    const results = await Promise.all(tasks);

    expect(executionCount).toBe(1);
    expect(results).toHaveLength(50);
    expect(results.every((r) => r.data === "expensive_payload")).toBe(true);
  });

  it("subsequent call after resolution executes fn again", async () => {
    const sf = new Singleflight();
    let counter = 0;

    const loader = async () => {
      counter++;
      return counter;
    };

    const first = await sf.run("key_seq", loader);
    expect(first).toBe(1);

    const second = await sf.run("key_seq", loader);
    expect(second).toBe(2);
  });

  it("propagates rejection to all concurrent callers if loader throws", async () => {
    const sf = new Singleflight();
    let calls = 0;

    const failingLoader = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      throw new Error("Database timeout");
    };

    const tasks = Array.from({ length: 10 }, () => sf.run("failing_key", failingLoader));
    const settled = await Promise.allSettled(tasks);

    expect(calls).toBe(1);
    expect(settled.every((s) => s.status === "rejected")).toBe(true);
    expect((settled[0] as PromiseRejectedResult).reason.message).toBe("Database timeout");
  });

  describe("calculateTtlWithJitter", () => {
    it("produces jittered TTL within ±15% of base TTL", () => {
      const baseTtl = 60;
      const minExpected = Math.floor(baseTtl * 0.85);
      const maxExpected = Math.ceil(baseTtl * 1.15);

      for (let i = 0; i < 100; i++) {
        const jittered = calculateTtlWithJitter(baseTtl);
        expect(jittered).toBeGreaterThanOrEqual(minExpected);
        expect(jittered).toBeLessThanOrEqual(maxExpected);
      }
    });
  });
});
