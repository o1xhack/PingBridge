import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { normalizeConfig, loadConfig } from "./config.js";
import { PingBridgeStore } from "./database.js";
import { createPingBridgeHttpServer } from "./http.js";
import { PingBridgeService } from "./service.js";
import type { PingBridgeConfig, ProviderRegistry } from "./types.js";

export * from "./config.js";
export * from "./database.js";
export * from "./http.js";
export * from "./providers.js";
export * from "./service.js";
export * from "./types.js";

export function createPingBridgeRuntime(config: PingBridgeConfig, providers?: ProviderRegistry) {
  const normalized = normalizeConfig(config);
  const store = new PingBridgeStore(normalized.server?.databasePath ?? "pingbridge.sqlite");
  const service = new PingBridgeService(normalized, store, providers);
  const server = createPingBridgeHttpServer(service, normalized);
  return { config: normalized, store, service, server };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const runtime = createPingBridgeRuntime(config);
  const host = runtime.config.server?.host ?? "127.0.0.1";
  const port = runtime.config.server?.port ?? 8787;
  runtime.server.listen(port, host, () => {
    console.log(`PingBridge listening on http://${host}:${port}`);
  });

  const shutdown = () => {
    runtime.server.close(() => {
      runtime.store.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (isDirectRun(import.meta.url)) {
  void main();
}

function isDirectRun(metaUrl: string): boolean {
  return (
    Boolean(process.argv[1]) &&
    pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(new URL(metaUrl))).href
  );
}
