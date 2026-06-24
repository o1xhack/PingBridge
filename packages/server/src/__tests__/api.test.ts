import { afterEach, describe, expect, it, vi } from "vitest";
import { type AddressInfo } from "node:net";
import { createPingBridgeRuntime } from "../index.js";
import type { NormalizedEvent, PingBridgeConfig, ProviderRegistry, ProviderSendContext } from "../types.js";

const runtimes: Array<ReturnType<typeof createPingBridgeRuntime>> = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
    runtime.store.close();
  }
});

describe("PingBridge HTTP API", () => {
  it("authenticates writes and routes only notify-worthy events", async () => {
    const sends: Array<{ event: NormalizedEvent; context: ProviderSendContext }> = [];
    const runtime = createRuntime({
      telegram: {
        send: vi.fn(async (_channel, event, context) => {
          sends.push({ event, context });
          return { ok: true as const, providerMessageId: `msg-${sends.length}` };
        })
      }
    });
    const baseUrl = await listen(runtime);

    const health = await fetch(`${baseUrl}/v1/health`);
    expect(health.status).toBe(200);

    const unauthorized = await fetch(`${baseUrl}/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload({ changed: true }))
    });
    expect(unauthorized.status).toBe(401);

    const changed = await postEvent(baseUrl, eventPayload({ changed: true }));
    expect(changed.status).toBe("delivered");
    expect(changed.deliveries).toHaveLength(1);
    expect(changed.deliveries[0].status).toBe("delivered");
    expect(sends).toHaveLength(1);

    const unchanged = await postEvent(baseUrl, eventPayload({ changed: false, title: "No changes" }));
    expect(unchanged.status).toBe("ignored");
    expect(unchanged.deliveries).toHaveLength(0);
    expect(sends).toHaveLength(1);

    const failed = await postEvent(
      baseUrl,
      eventPayload({ eventType: "sync.failed", changed: false, severity: "error", title: "Failed" })
    );
    expect(failed.status).toBe("delivered");
    expect(sends).toHaveLength(2);
    expect(sends[1].context.priority).toBe("high");

    const recent = await getJson(`${baseUrl}/v1/events/recent?limit=10`);
    expect(recent.events.map((event: { status: string }) => event.status)).toContain("ignored");
  });

  it("deduplicates repeated dedupeKey values inside the configured window", async () => {
    const provider = vi.fn(async () => ({ ok: true as const }));
    const runtime = createRuntime({ telegram: { send: provider } });
    const baseUrl = await listen(runtime);

    const first = await postEvent(baseUrl, eventPayload({ changed: true, dedupeKey: "same-key" }));
    const second = await postEvent(baseUrl, eventPayload({ changed: true, dedupeKey: "same-key" }));

    expect(first.status).toBe("delivered");
    expect(second.status).toBe("deduplicated");
    expect(second.deliveries).toHaveLength(0);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("retries provider failures and records failed deliveries", async () => {
    let attempts = 0;
    const runtime = createRuntime({
      telegram: {
        send: vi.fn(async () => {
          attempts += 1;
          if (attempts < 3) {
            return { ok: false as const, statusCode: 503, error: "temporary failure" };
          }
          return { ok: true as const, providerMessageId: "msg-retry" };
        })
      }
    });
    const baseUrl = await listen(runtime);

    const retried = await postEvent(baseUrl, eventPayload({ changed: true, title: "Retry me" }));
    expect(retried.status).toBe("delivered");
    expect(retried.deliveries[0].attempts).toBe(3);
    expect(retried.deliveries[0].providerMessageId).toBe("msg-retry");

    const failingRuntime = createRuntime({
      telegram: {
        send: vi.fn(async () => ({ ok: false, statusCode: 500, error: "still down" }))
      }
    });
    const failingBaseUrl = await listen(failingRuntime);
    const failed = await postEvent(failingBaseUrl, eventPayload({ changed: true, title: "Fail me" }));
    expect(failed.status).toBe("failed");
    expect(failed.deliveries[0].attempts).toBe(4);

    const failedList = await getJson(`${failingBaseUrl}/v1/deliveries/failed?limit=5`);
    expect(failedList.deliveries).toHaveLength(1);
    expect(failedList.deliveries[0].error).toBe("still down");
  });

  it("tests a single channel and lists channels", async () => {
    const provider = vi.fn(async () => ({ ok: true as const }));
    const runtime = createRuntime({ telegram: { send: provider } });
    const baseUrl = await listen(runtime);

    const channels = await getJson(`${baseUrl}/v1/channels`);
    expect(channels.channels).toEqual([{ id: "telegram_main", type: "telegram" }]);

    const response = await fetch(`${baseUrl}/v1/channels/telegram_main/test`, {
      method: "POST",
      headers: authHeaders()
    });
    const payload = await response.json();
    expect(response.status).toBe(202);
    expect(payload.status).toBe("delivered");
    expect(provider).toHaveBeenCalledTimes(1);
  });
});

function createRuntime(providers: ProviderRegistry): ReturnType<typeof createPingBridgeRuntime> {
  const config: PingBridgeConfig = {
    server: {
      appToken: "test-token",
      databasePath: ":memory:",
      dedupeWindowSeconds: 3600,
      deliveryRetries: 3,
      deliveryRetryDelayMs: 0
    },
    channels: {
      telegram_main: {
        type: "telegram",
        botToken: "bot-token",
        chatId: "chat-id"
      }
    },
    targets: {
      me: {
        channels: ["telegram_main"]
      }
    },
    rules: [
      { match: { eventType: "auth.expired" }, target: "me", priority: "high" },
      { match: { eventType: "sync.completed", changed: true }, target: "me", priority: "normal" }
    ]
  };
  const runtime = createPingBridgeRuntime(config, providers);
  runtimes.push(runtime);
  return runtime;
}

async function listen(runtime: ReturnType<typeof createPingBridgeRuntime>): Promise<string> {
  await new Promise<void>((resolve) => runtime.server.listen(0, "127.0.0.1", () => resolve()));
  const address = runtime.server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function postEvent(baseUrl: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${baseUrl}/v1/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    },
    body: JSON.stringify(payload)
  });
  expect(response.status).toBe(202);
  return response.json();
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: authHeaders() });
  expect(response.status).toBe(200);
  return response.json();
}

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer test-token" };
}

function eventPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "obsidian-sync-trakt",
    eventType: "sync.completed",
    target: "me",
    title: "Trakt sync completed",
    message: "Wrote 3 daily notes.",
    severity: "info",
    changed: true,
    ...overrides
  };
}
