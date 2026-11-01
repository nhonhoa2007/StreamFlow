export class Singleflight {
  private flights = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.flights.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.flights.delete(key);
      }
    })();

    this.flights.set(key, promise);
    return promise;
  }
}

export function calculateTtlWithJitter(baseTtlSeconds: number, jitterRatio = 0.15): number {
  // Jitter between -15% and +15%
  const delta = baseTtlSeconds * jitterRatio;
  const randomFactor = (Math.random() * 2 - 1) * delta;
  return Math.max(1, Math.round(baseTtlSeconds + randomFactor));
}
