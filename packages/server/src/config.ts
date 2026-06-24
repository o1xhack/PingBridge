import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import type { ChannelConfig, PingBridgeConfig } from "./types.js";

const DEFAULT_CONFIG_PATH = "pingbridge.config.yaml";

export function loadConfig(configPath = process.env.PINGBRIDGE_CONFIG ?? DEFAULT_CONFIG_PATH): PingBridgeConfig {
  const resolvedPath = resolve(configPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`PingBridge config file not found: ${resolvedPath}`);
  }

  const raw = readFileSync(resolvedPath, "utf8");
  const expanded = expandEnv(raw, process.env);
  const parsed = YAML.parse(expanded) as PingBridgeConfig;
  return normalizeConfig(parsed);
}

export function normalizeConfig(config: PingBridgeConfig): PingBridgeConfig {
  if (!config || typeof config !== "object") {
    throw new Error("PingBridge config must be an object.");
  }
  if (!config.channels || Object.keys(config.channels).length === 0) {
    throw new Error("PingBridge config must define at least one channel.");
  }
  if (!config.targets || Object.keys(config.targets).length === 0) {
    throw new Error("PingBridge config must define at least one target.");
  }

  for (const [id, channel] of Object.entries(config.channels)) {
    validateChannel(id, channel);
  }

  for (const [id, target] of Object.entries(config.targets)) {
    if (!Array.isArray(target.channels) || target.channels.length === 0) {
      throw new Error(`Target "${id}" must list at least one channel.`);
    }
    for (const channelId of target.channels) {
      if (!config.channels[channelId]) {
        throw new Error(`Target "${id}" references unknown channel "${channelId}".`);
      }
    }
  }

  return {
    ...config,
    server: {
      host: "127.0.0.1",
      port: 8787,
      databasePath: "pingbridge.sqlite",
      dedupeWindowSeconds: 3600,
      deliveryRetries: 3,
      deliveryRetryDelayMs: 250,
      requestTimeoutMs: 10000,
      ...config.server
    },
    rules: config.rules ?? []
  };
}

export function expandEnv(input: string, env: NodeJS.ProcessEnv): string {
  return input.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, name: string) => env[name] ?? "");
}

function validateChannel(id: string, channel: ChannelConfig): void {
  if (!channel || typeof channel !== "object") {
    throw new Error(`Channel "${id}" must be an object.`);
  }

  switch (channel.type) {
    case "telegram":
      requireString(id, "botToken", channel.botToken);
      requireString(id, "chatId", channel.chatId);
      break;
    case "bark":
      requireString(id, "deviceKey", channel.deviceKey);
      break;
    case "ntfy":
      requireString(id, "topic", channel.topic);
      break;
    default:
      throw new Error(`Channel "${id}" has unsupported type "${(channel as { type?: string }).type}".`);
  }
}

function requireString(channelId: string, field: string, value: unknown): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Channel "${channelId}" must define "${field}".`);
  }
}
