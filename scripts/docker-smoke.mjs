import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = resolve(new URL("..", import.meta.url).pathname);

if (!commandOk("docker", ["--version"])) {
  skipOrFail("docker smoke: skipped (docker CLI is not available)");
}

if (!commandOk("docker", ["info"])) {
  skipOrFail("docker smoke: skipped (docker daemon is not running)");
}

const image = `pingbridge:smoke-${Date.now()}`;
const tempDir = mkdtempSync(join(tmpdir(), "pingbridge-docker-smoke-"));
let containerId = "";

try {
  writeFileSync(
    join(tempDir, "pingbridge.config.yaml"),
    `
server:
  host: 0.0.0.0
  port: 8787
  appToken: smoke-token
  databasePath: /data/pingbridge.sqlite
channels:
  ntfy_dummy:
    type: ntfy
    server: https://ntfy.sh
    topic: pingbridge-smoke-dummy
targets:
  smoke:
    channels:
      - ntfy_dummy
`
  );

  run("docker", ["build", "-t", image, "."], { cwd: root });
  containerId = execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "-p",
      "127.0.0.1::8787",
      "-e",
      "PINGBRIDGE_CONFIG=/app/config/pingbridge.config.yaml",
      "-v",
      `${join(tempDir, "pingbridge.config.yaml")}:/app/config/pingbridge.config.yaml:ro`,
      "-v",
      `${tempDir}:/data`,
      image
    ],
    { cwd: root, encoding: "utf8" }
  ).trim();

  const port = execFileSync("docker", ["port", containerId, "8787/tcp"], { encoding: "utf8" }).trim().split(":").at(-1);
  if (!port) {
    throw new Error("Could not determine mapped Docker port.");
  }

  const healthUrl = `http://127.0.0.1:${port}/v1/health`;
  let lastError;
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      const payload = await response.json();
      if (response.ok && payload.status === "ok") {
        console.log("docker smoke: ok");
        healthy = true;
        break;
      }
      lastError = new Error(`unexpected health response ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }

  if (!healthy) {
    throw lastError ?? new Error("Docker health check failed.");
  }
} finally {
  if (containerId) {
    spawnSync("docker", ["stop", containerId], { stdio: "ignore" });
  }
  spawnSync("docker", ["rmi", image], { stdio: "ignore" });
  rmSync(tempDir, { recursive: true, force: true });
}

function commandOk(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function skipOrFail(message) {
  if (process.env.PINGBRIDGE_REQUIRE_DOCKER === "1") {
    throw new Error(message.replace("skipped", "failed"));
  }
  console.log(message);
  process.exit(0);
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}
