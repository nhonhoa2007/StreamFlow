import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export interface TestDatabaseInstance {
  databaseUrl: string;
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

export async function startTestDatabase(): Promise<TestDatabaseInstance> {
  // 1. Try Testcontainers first if Docker is running
  try {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    const container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("streamflow_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    return {
      databaseUrl: container.getConnectionUri(),
      cleanup: async () => {
        await container.stop();
      },
    };
  } catch (_dockerErr) {
    // 2. Fall back to local isolated postgres cluster (ideal for Linux sandbox)
    const tmpDir = process.env.TMPDIR || os.tmpdir();
    const dbDir = path.join(tmpDir, `pg_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    execFileSync("initdb", ["-D", dbDir, "-U", "postgres", "-A", "trust", "--no-locale"], {
      stdio: "pipe",
    });

    const port = await findAvailablePort();
    const pgProcess = spawn("postgres", [
      "-D",
      dbDir,
      "-c",
      "unix_socket_directories=",
      "-p",
      String(port),
      "-h",
      "127.0.0.1",
    ]);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pgProcess.kill("SIGKILL");
        reject(new Error("Timeout waiting for local PostgreSQL cluster to start"));
      }, 10000);

      const onData = (data: Buffer) => {
        const msg = data.toString();
        if (msg.includes("ready to accept connections")) {
          clearTimeout(timeout);
          pgProcess.stderr.off("data", onData);
          pgProcess.stdout.off("data", onData);
          resolve();
        }
      };

      pgProcess.stderr.on("data", onData);
      pgProcess.stdout.on("data", onData);
      pgProcess.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Create the test database
    execFileSync(
      "createdb",
      ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "streamflow_test"],
      { stdio: "pipe" },
    );

    const databaseUrl = `postgres://postgres@127.0.0.1:${port}/streamflow_test`;

    return {
      databaseUrl,
      cleanup: async () => {
        pgProcess.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 300));
        try {
          fs.rmSync(dbDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      },
    };
  }
}
