import { describe, expect, it, vi } from "vitest";
import type { PingBridgeClient } from "@pingbridge/client";
import { createToolHandlers, toolResult } from "../tools.js";

describe("MCP tool handlers", () => {
  it("delegates send_notification to the PingBridge client", async () => {
    const client = {
      notify: vi.fn(async () => ({ eventId: "evt_mcp", status: "delivered", deliveries: [] }))
    } as unknown as PingBridgeClient;
    const handlers = createToolHandlers(client);

    const result = await handlers.send_notification({
      source: "codex-automation",
      eventType: "task.completed",
      target: "me",
      title: "Done",
      message: "Task completed",
      changed: true
    });

    expect(result).toMatchObject({ eventId: "evt_mcp" });
    expect(client.notify).toHaveBeenCalledOnce();
  });

  it("formats MCP text results", () => {
    expect(toolResult({ ok: true })).toEqual({
      content: [{ type: "text", text: JSON.stringify({ ok: true }, null, 2) }]
    });
  });
});
