#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PingBridgeClient, PingBridgeClientError, type NotifyInput } from "@pingbridge/client";

interface CliIo {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

type ParsedOptions = Record<string, string | boolean>;

export async function runCli(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
  fetchImpl?: typeof fetch
): Promise<number> {
  const [command, ...rest] = argv;
  const options = parseOptions(rest);

  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      io.stdout.write(helpText());
      return 0;
    }

    const client = createClient(options, env, fetchImpl);
    let result: unknown;

    if (command === "notify") {
      result = await client.notify(readNotifyInput(options));
    } else if (command === "preview") {
      result = await client.preview(readNotifyInput(options));
    } else if (command === "health") {
      result = await client.health();
    } else if (command === "test-channel") {
      const channelId = readOption(options, "channel") ?? readPositional(rest);
      if (!channelId) throw new Error("test-channel requires --channel <id> or a positional channel id.");
      result = await client.test(channelId);
    } else if (command === "recent") {
      result = await client.recent(readLimit(options));
    } else if (command === "failed") {
      result = await client.failedDeliveries(readLimit(options));
    } else if (command === "channels") {
      result = await client.listChannels();
    } else {
      throw new Error(`Unknown command "${command}".`);
    }

    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof PingBridgeClientError) {
      io.stderr.write(`PingBridge request failed (${error.status} ${error.code}): ${error.message}\n`);
    } else {
      io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    return 1;
  }
}

export function parseOptions(args: string[]): ParsedOptions {
  const options: ParsedOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    const key = camelCase(rawKey);
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

function createClient(options: ParsedOptions, env: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): PingBridgeClient {
  const endpoint =
    stringOption(options, "endpoint") ?? env.PINGBRIDGE_ENDPOINT ?? env.PINGBRIDGE_URL ?? "http://127.0.0.1:8787";
  const token = stringOption(options, "token") ?? env.PINGBRIDGE_TOKEN;
  return new PingBridgeClient({ endpoint, token, fetch: fetchImpl });
}

function readNotifyInput(options: ParsedOptions): NotifyInput {
  const eventType = stringOption(options, "event") ?? stringOption(options, "eventType");
  if (!eventType) {
    throw new Error("Missing required option --event.");
  }

  return {
    source: requireOption(options, "source"),
    eventType,
    target: requireOption(options, "target"),
    title: requireOption(options, "title"),
    message: requireOption(options, "message"),
    severity: stringOption(options, "severity") as NotifyInput["severity"],
    changed: booleanOption(options, "changed"),
    dedupeKey: stringOption(options, "dedupeKey")
  };
}

function readLimit(options: ParsedOptions): number {
  const raw = stringOption(options, "limit");
  if (!raw) {
    return 20;
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  return limit;
}

function requireOption(options: ParsedOptions, key: string): string {
  const value = stringOption(options, key);
  if (!value) {
    throw new Error(`Missing required option --${kebabCase(key)}.`);
  }
  return value;
}

function readOption(options: ParsedOptions, key: string): string | undefined {
  return stringOption(options, key);
}

function stringOption(options: ParsedOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function booleanOption(options: ParsedOptions, key: string): boolean | undefined {
  const value = options[key];
  if (value === undefined) {
    return undefined;
  }
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  throw new Error(`--${kebabCase(key)} must be true or false.`);
}

function readPositional(args: string[]): string | undefined {
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.startsWith("--")) {
      if (!value.includes("=") && args[index + 1] && !args[index + 1].startsWith("--")) {
        index += 1;
      }
      continue;
    }
    positionals.push(value);
  }
  return positionals[0];
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function helpText(): string {
  return `PingBridge CLI

Usage:
  pingbridge notify --source app --event sync.completed --target me --title "Done" --message "Changed" --changed true
  pingbridge preview --source app --event sync.completed --target me --title "Done" --message "Changed" --changed true
  pingbridge health
  pingbridge test-channel --channel telegram_main
  pingbridge recent --limit 20
  pingbridge failed --limit 20
  pingbridge channels

Options:
  --endpoint URL   PingBridge endpoint. Defaults to PINGBRIDGE_ENDPOINT or http://127.0.0.1:8787.
  --token TOKEN    Bearer token. Defaults to PINGBRIDGE_TOKEN.
`;
}

if (isDirectRun(import.meta.url)) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}

function isDirectRun(metaUrl: string): boolean {
  return (
    Boolean(process.argv[1]) &&
    pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(new URL(metaUrl))).href
  );
}
