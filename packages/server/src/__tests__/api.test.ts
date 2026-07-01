import { afterEach, describe, expect, it, vi } from "vitest";
import { type AddressInfo } from "node:net";
import { createPingBridgeRuntime } from "../index.js";
import type {
  ChannelConfig,
  NormalizedEvent,
  PingBridgeConfig,
  ProviderRegistry,
  ProviderSendContext
} from "../types.js";

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

    const preview = await previewEvent(baseUrl, eventPayload({ changed: true, title: "Preview me" }));
    expect(preview).toMatchObject({
      status: "preview",
      notify: true,
      target: "me",
      priority: "normal",
      channels: [{ id: "telegram_main", type: "telegram" }],
      dedupe: { duplicate: false }
    });
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

  it("sends with portable user config so app developers do not implement provider adapters", async () => {
    const sends: Array<{ channel: ChannelConfig; event: NormalizedEvent; context: ProviderSendContext }> = [];
    const runtime = createRuntime({
      bark: {
        send: vi.fn(async (channel, event, context) => {
          sends.push({ channel, event, context });
          return { ok: true as const, providerMessageId: "bark-ok" };
        })
      },
      telegram: {
        send: vi.fn(async (channel, event, context) => {
          sends.push({ channel, event, context });
          return { ok: true as const, providerMessageId: "telegram-ok" };
        })
      }
    });
    const baseUrl = await listen(runtime);

    const input = portableMessagePayload();
    const healthResponse = await fetch(`${baseUrl}/v1/configs/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify({ config: input.config })
    });
    const health = await healthResponse.json();
    expect(healthResponse.status).toBe(200);
    expect(health).toMatchObject({
      status: "ok",
      app: { id: "obsidian-sync-trakt", name: "Obsidian Sync Trakt" },
      groups: [
        {
          id: "personal",
          channels: [
            { id: "user_bark", type: "bark", supported: true },
            { id: "user_telegram", type: "telegram", supported: true }
          ]
        }
      ],
      warnings: []
    });
    expect(sends).toHaveLength(0);

    const previewResponse = await fetch(`${baseUrl}/v1/messages/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify(input)
    });
    const preview = await previewResponse.json();
    expect(previewResponse.status).toBe(200);
    expect(preview).toMatchObject({
      status: "preview",
      notify: true,
      app: { id: "obsidian-sync-trakt", name: "Obsidian Sync Trakt" },
      group: "personal",
      target: "personal",
      channels: [
        { id: "user_bark", type: "bark" },
        { id: "user_telegram", type: "telegram" }
      ]
    });
    expect(sends).toHaveLength(0);

    const sendResponse = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify(input)
    });
    const sent = await sendResponse.json();
    expect(sendResponse.status).toBe(202);
    expect(sent.status).toBe("delivered");
    expect(sent.deliveries).toHaveLength(2);
    expect(sends.map((send) => send.channel.type)).toEqual(["bark", "telegram"]);
    expect(sends[0].event).toMatchObject({
      source: "obsidian-sync-trakt",
      target: "personal",
      presentation: {
        appName: "Obsidian Sync Trakt",
        iconUrl: "https://example.com/obsidian-sync-trakt.png",
        group: "Obsidian"
      }
    });
    expect(sends[0].context.priority).toBe("normal");

    const recent = await getJson(`${baseUrl}/v1/events/recent?limit=1`);
    const serializedPayload = JSON.stringify(recent.events[0].payload);
    expect(serializedPayload).toContain("Obsidian Sync Trakt");
    expect(serializedPayload).not.toContain("bark-device-from-user");
    expect(serializedPayload).not.toContain("telegram-bot-token-from-user");
  });

  it("rejects portable configs that reference missing user channels", async () => {
    const runtime = createRuntime({});
    const baseUrl = await listen(runtime);
    const input = portableMessagePayload({
      config: {
        groups: {
          personal: {
            channels: ["missing_channel"]
          }
        }
      }
    });

    const response = await fetch(`${baseUrl}/v1/messages/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify(input)
    });
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_config");
    expect(payload.error.message).toContain('Group "personal" references unknown channel "missing_channel"');
  });

  it("rejects portable configs with default groups that do not exist", async () => {
    const runtime = createRuntime({});
    const baseUrl = await listen(runtime);
    const input = portableMessagePayload({
      config: {
        app: {
          defaultGroup: "missing_group"
        }
      }
    });

    const response = await fetch(`${baseUrl}/v1/configs/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify({ config: input.config })
    });
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_config");
    expect(payload.error.message).toBe('config.app.defaultGroup "missing_group" is not defined.');
  });

  it("warns when portable config uses a channel without a registered provider", async () => {
    const runtime = createRuntime({
      bark: {
        send: vi.fn(async () => ({ ok: true as const }))
      }
    });
    const baseUrl = await listen(runtime);
    const input = portableMessagePayload();

    const response = await fetch(`${baseUrl}/v1/configs/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify({ config: input.config })
    });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.status).toBe("warning");
    expect(payload.channels).toContainEqual({ id: "user_bark", type: "bark", supported: true });
    expect(payload.channels).toContainEqual({ id: "user_telegram", type: "telegram", supported: false });
    expect(payload.warnings).toEqual(['No provider registered for channel "user_telegram" (telegram).']);
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

async function previewEvent(baseUrl: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${baseUrl}/v1/events/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    },
    body: JSON.stringify(payload)
  });
  expect(response.status).toBe(200);
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

function portableMessagePayload(overrides: Record<string, any> = {}): Record<string, unknown> {
  return deepMerge(
    {
      config: {
        app: {
          id: "obsidian-sync-trakt",
          name: "Obsidian Sync Trakt",
          iconUrl: "https://example.com/obsidian-sync-trakt.png",
          defaultGroup: "personal"
        },
        channels: {
          user_bark: {
            type: "bark",
            endpoint: "https://api.day.app",
            deviceKey: "bark-device-from-user"
          },
          user_telegram: {
            type: "telegram",
            botToken: "telegram-bot-token-from-user",
            chatId: "telegram-chat-id-from-user"
          }
        },
        groups: {
          personal: {
            label: "Obsidian",
            iconUrl: "https://example.com/obsidian-sync-trakt.png",
            channels: ["user_bark", "user_telegram"]
          }
        }
      },
      message: {
        eventType: "sync.completed",
        title: "Trakt sync completed",
        message: "Wrote 3 daily notes.",
        changed: true,
        dedupeKey: "obsidian-sync-trakt:daily-notes"
      }
    },
    overrides
  );
}

function deepMerge<T extends Record<string, any>>(base: T, overrides: Record<string, any>): T {
  const result: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
