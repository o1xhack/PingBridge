import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPingBridgeRuntime } from "../packages/server/dist/index.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const tempDir = mkdtempSync(join(tmpdir(), "pingbridge-external-consumer-"));
const tarballDir = join(tempDir, "tarballs");

const providerCalls = [];
const runtime = createPingBridgeRuntime(
  {
    server: {
      appToken: "external-smoke-token",
      databasePath: ":memory:",
      deliveryRetries: 0,
      deliveryRetryDelayMs: 0
    },
    channels: {
      ntfy_dummy: {
        type: "ntfy",
        server: "https://ntfy.invalid",
        topic: "external-consumer-smoke"
      }
    },
    targets: {
      app: {
        channels: ["ntfy_dummy"]
      }
    }
  },
  {
    ntfy: {
      async send(_channel, event, context) {
        providerCalls.push({ event, context });
        return { ok: true, providerMessageId: "external-smoke-message" };
      }
    }
  }
);

try {
  run("npm", ["run", "build"], { cwd: root });
  await new Promise((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const address = runtime.server.address();
  const port = typeof address === "object" && address ? address.port : undefined;
  if (!port) {
    throw new Error("Could not start PingBridge test server.");
  }

  run("mkdir", ["-p", tarballDir]);
  const tarballName = execFileSync(
    "npm",
    ["pack", "--workspace", "@pingbridge/client", "--pack-destination", tarballDir],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"]
    }
  )
    .trim()
    .split("\n")
    .at(-1);
  if (!tarballName) {
    throw new Error("npm pack did not return a client tarball name.");
  }

  writeFileSync(
    join(tempDir, "package.json"),
    JSON.stringify({ name: "external-pingbridge-consumer", version: "0.0.0", type: "module", private: true }, null, 2)
  );
  run("npm", ["install", "--ignore-scripts", join(tarballDir, tarballName)], { cwd: tempDir });

  writeFileSync(
    join(tempDir, "consumer.mjs"),
    `
import assert from "node:assert/strict";
import { PingBridgeClient } from "@pingbridge/client";

const client = new PingBridgeClient({
  endpoint: process.env.PINGBRIDGE_ENDPOINT,
  token: process.env.PINGBRIDGE_TOKEN
});

const event = {
  source: "external-consumer-smoke",
  eventType: "task.completed",
  target: "app",
  title: "External consumer smoke",
  message: "This came from an external temp project.",
  changed: true,
  dedupeKey: "external-consumer-smoke"
};

const health = await client.health();
assert.equal(health.status, "ok");

const preview = await client.preview(event);
assert.equal(preview.status, "preview");
assert.equal(preview.notify, true);
assert.equal(preview.channels[0].id, "ntfy_dummy");

const response = await client.notify(event);
assert.equal(response.status, "delivered");
assert.equal(response.deliveries[0].status, "delivered");
console.log("external consumer smoke: ok");
process.exit(0);
`
  );

  await runAsync(process.execPath, ["consumer.mjs"], {
    cwd: tempDir,
    env: {
      ...process.env,
      PINGBRIDGE_ENDPOINT: `http://127.0.0.1:${port}`,
      PINGBRIDGE_TOKEN: "external-smoke-token"
    }
  });

  if (providerCalls.length !== 1) {
    throw new Error(`Expected exactly one provider call after preview+notify, got ${providerCalls.length}.`);
  }
  console.log("external consumer smoke: provider call verified");
} finally {
  await new Promise((resolve) => runtime.server.close(resolve));
  runtime.store.close();
  rmSync(tempDir, { recursive: true, force: true });
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}`));
      }
    });
  });
}
