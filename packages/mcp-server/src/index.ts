#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PingBridgeClient } from "@o1x/pingbridge-client";
import { z } from "zod";
import { createToolHandlers, toolResult } from "./tools.js";

const notifyInputSchema = {
  source: z.string().min(1),
  eventType: z.string().min(1),
  target: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["info", "success", "warning", "error"]).optional(),
  changed: z.boolean().optional(),
  dedupeKey: z.string().min(1).optional(),
  items: z.array(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional()
};

export async function startMcpServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const endpoint = env.PINGBRIDGE_ENDPOINT ?? env.PINGBRIDGE_URL ?? "http://127.0.0.1:8787";
  const token = env.PINGBRIDGE_TOKEN;
  const client = new PingBridgeClient({ endpoint, token });
  const handlers = createToolHandlers(client);

  const server = new McpServer({ name: "pingbridge", version: "1.0.0" });

  server.registerTool(
    "send_notification",
    {
      title: "Send notification",
      description: "Send a standard PingBridge event notification.",
      inputSchema: notifyInputSchema
    },
    async (input) => toolResult(await handlers.send_notification(input))
  );

  server.registerTool(
    "test_channel",
    {
      title: "Test channel",
      description: "Send a test notification to one configured channel.",
      inputSchema: { channelId: z.string().min(1) }
    },
    async (input) => toolResult(await handlers.test_channel(input))
  );

  server.registerTool(
    "list_channels",
    {
      title: "List channels",
      description: "List configured PingBridge channels.",
      inputSchema: {}
    },
    async () => toolResult(await handlers.list_channels())
  );

  server.registerTool(
    "list_recent_events",
    {
      title: "List recent events",
      description: "List recent PingBridge events.",
      inputSchema: { limit: z.number().int().positive().max(100).optional() }
    },
    async (input) => toolResult(await handlers.list_recent_events(input))
  );

  server.registerTool(
    "list_failed_deliveries",
    {
      title: "List failed deliveries",
      description: "List recent failed PingBridge deliveries.",
      inputSchema: { limit: z.number().int().positive().max(100).optional() }
    },
    async (input) => toolResult(await handlers.list_failed_deliveries(input))
  );

  server.registerTool(
    "get_delivery_status",
    {
      title: "Get delivery status",
      description: "Fetch one delivery by id.",
      inputSchema: { deliveryId: z.string().min(1) }
    },
    async (input) => toolResult(await handlers.get_delivery_status(input))
  );

  await server.connect(new StdioServerTransport());
}

if (isDirectRun(import.meta.url)) {
  startMcpServer().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { createToolHandlers } from "./tools.js";

function isDirectRun(metaUrl: string): boolean {
  return (
    Boolean(process.argv[1]) &&
    pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(new URL(metaUrl))).href
  );
}
