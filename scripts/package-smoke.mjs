import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const tempDir = mkdtempSync(join(tmpdir(), "pingbridge-package-smoke-"));
const tarballDir = join(tempDir, "tarballs");

try {
  run("npm", ["run", "clean"], { cwd: root });
  run("npm", ["run", "build"], { cwd: root });
  run("mkdir", ["-p", tarballDir]);

  const packages = ["@pingbridge/server", "@pingbridge/client", "@pingbridge/cli", "@pingbridge/mcp-server"];
  const tarballs = packages.map((workspace) => {
    const output = execFileSync("npm", ["pack", "--workspace", workspace, "--pack-destination", tarballDir], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"]
    }).trim();
    return join(tarballDir, output.split("\n").at(-1));
  });

  writeFileSync(
    join(tempDir, "package.json"),
    JSON.stringify({ name: "pingbridge-smoke-consumer", version: "0.0.0", type: "module", private: true }, null, 2)
  );

  run("npm", ["install", "--ignore-scripts", ...tarballs], { cwd: tempDir });

  writeFileSync(
    join(tempDir, "import-smoke.mjs"),
    `
import assert from "node:assert/strict";
import { PingBridgeClient } from "@pingbridge/client";
import { createPingBridgeRuntime } from "@pingbridge/server";
import { runCli } from "@pingbridge/cli";

assert.equal(typeof PingBridgeClient, "function");
assert.equal(typeof createPingBridgeRuntime, "function");
assert.equal(typeof runCli, "function");

const client = new PingBridgeClient({ endpoint: "http://127.0.0.1:8787", token: "test" });
assert.equal(typeof client.notify, "function");
`
  );
  run(process.execPath, ["import-smoke.mjs"], { cwd: tempDir });

  const cliHelp = execFileSync(join(tempDir, "node_modules/.bin/pingbridge"), ["help"], {
    cwd: tempDir,
    encoding: "utf8"
  });
  if (!cliHelp.includes("PingBridge CLI")) {
    throw new Error("CLI help smoke test did not print expected help text.");
  }

  writeFileSync(
    join(tempDir, "mcp-smoke.mjs"),
    `
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "./node_modules/.bin/pingbridge-mcp",
  env: {
    ...process.env,
    PINGBRIDGE_ENDPOINT: "http://127.0.0.1:1",
    PINGBRIDGE_TOKEN: "test"
  }
});
const client = new Client({ name: "pingbridge-package-smoke", version: "0.0.0" });
await client.connect(transport);
const tools = await client.listTools();
const names = tools.tools.map((tool) => tool.name);
for (const expected of ["send_notification", "test_channel", "list_channels", "list_recent_events", "list_failed_deliveries", "get_delivery_status"]) {
  assert.ok(names.includes(expected), "missing MCP tool " + expected);
}
await client.close();
`
  );
  run(process.execPath, ["mcp-smoke.mjs"], { cwd: tempDir });

  console.log("package smoke: ok");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}
