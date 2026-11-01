import { type ChildProcess, spawn } from "node:child_process";
import net from "node:net";

export interface TestRedisInstance {
  redisUrl: string;
  cleanup: () => Promise<void>;
}

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export async function startTestRedis(): Promise<TestRedisInstance> {
  const port = await findAvailablePort();
  const redisProcess = spawn("redis-server", [
    "--port",
    String(port),
    "--bind",
    "127.0.0.1",
    "--save",
    "",
    "--appendonly",
    "no",
  ]);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      redisProcess.kill("SIGKILL");
      reject(new Error("Timeout waiting for test Redis to start"));
    }, 5000);

    const onData = (data: Buffer) => {
      if (data.toString().includes("Ready to accept connections")) {
        clearTimeout(timeout);
        redisProcess.stdout.off("data", onData);
        resolve();
      }
    };

    redisProcess.stdout.on("data", onData);
    redisProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const redisUrl = `redis://127.0.0.1:${port}`;

  return {
    redisUrl,
    cleanup: async () => {
      redisProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 100));
    },
  };
}
