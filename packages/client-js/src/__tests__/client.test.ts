import { describe, expect, it, vi } from "vitest";
import { PingBridgeClient, PingBridgeClientError } from "../index.js";

describe("PingBridgeClient", () => {
  it("sends notify requests with bearer auth", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      return new Response(JSON.stringify({ eventId: "evt_1", status: "delivered", deliveries: [] }), { status: 202 });
    }) as unknown as typeof fetch;
    const client = new PingBridgeClient({ endpoint: "http://localhost:8787/", token: "token", fetch: fetchImpl });

    const response = await client.notify({
      source: "app",
      eventType: "sync.completed",
      target: "me",
      title: "Done",
      message: "Changed",
      changed: true
    });

    expect(response.eventId).toBe("evt_1");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8787/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" })
      })
    );
    const body = JSON.parse((fetchImpl as any).mock.calls[0][1].body);
    expect(body.changed).toBe(true);
  });

  it("checks service health", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new PingBridgeClient({ endpoint: "http://localhost:8787", fetch: fetchImpl });

    await expect(client.health()).resolves.toEqual({ status: "ok" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8787/v1/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("sets convenience event fields", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(init?.body as string));
      return new Response(JSON.stringify({ eventId: "evt_1", status: "delivered", deliveries: [] }), { status: 202 });
    }) as unknown as typeof fetch;
    const client = new PingBridgeClient({ endpoint: "http://localhost:8787", fetch: fetchImpl });

    await client.authExpired({
      source: "app",
      target: "me",
      title: "Auth expired",
      message: "Reconnect required"
    });

    expect(bodies[0]).toMatchObject({ eventType: "auth.expired", severity: "error", changed: true });
  });

  it("previews events without sending them", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body.eventType).toBe("sync.completed");
      return new Response(
        JSON.stringify({
          status: "preview",
          notify: true,
          target: "me",
          priority: "normal",
          channels: [{ id: "ntfy_personal", type: "ntfy" }],
          dedupe: { duplicate: false }
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const client = new PingBridgeClient({ endpoint: "http://localhost:8787", token: "token", fetch: fetchImpl });

    const preview = await client.preview({
      source: "app",
      eventType: "sync.completed",
      target: "me",
      title: "Done",
      message: "Changed",
      changed: true
    });

    expect(preview.notify).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8787/v1/events/preview",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("checks portable notification config without sending a message", async () => {
    const config = portableConfig();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body.config).toEqual(config);
      return new Response(
        JSON.stringify({
          status: "ok",
          app: { id: "obsidian-sync-trakt", name: "Obsidian Sync Trakt" },
          groups: [
            {
              id: "personal",
              label: "Obsidian",
              channels: [{ id: "phone", type: "bark", supported: true }]
            }
          ],
          channels: [{ id: "phone", type: "bark", supported: true }],
          warnings: []
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const client = new PingBridgeClient({ endpoint: "http://localhost:8787", token: "token", fetch: fetchImpl });

    await expect(client.checkConfig(config)).resolves.toMatchObject({ status: "ok" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8787/v1/configs/health",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("previews and sends portable messages with user-owned provider config", async () => {
    const input = portableMessage();
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body).toEqual(input);
      if (String(url).endsWith("/v1/messages/preview")) {
        return new Response(
          JSON.stringify({
            status: "preview",
            notify: true,
            target: "personal",
            priority: "normal",
            channels: [{ id: "phone", type: "bark" }],
            dedupe: { duplicate: false },
            app: { id: "obsidian-sync-trakt", name: "Obsidian Sync Trakt" },
            group: "personal"
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ eventId: "evt_1", status: "delivered", deliveries: [] }), {
        status: 202
      });
    }) as unknown as typeof fetch;
    const client = new PingBridgeClient({ endpoint: "http://localhost:8787", token: "token", fetch: fetchImpl });

    await expect(client.previewMessage(input)).resolves.toMatchObject({ app: { id: "obsidian-sync-trakt" } });
    await expect(client.sendMessage(input)).resolves.toMatchObject({ status: "delivered" });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8787/v1/messages/preview",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8787/v1/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws structured errors", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { code: "unauthorized", message: "No token" } }), { status: 401 });
    }) as unknown as typeof fetch;
    const client = new PingBridgeClient({ endpoint: "http://localhost:8787", fetch: fetchImpl });

    await expect(client.recent()).rejects.toMatchObject(new PingBridgeClientError(401, "unauthorized", "No token"));
  });
});

function portableConfig() {
  return {
    app: {
      id: "obsidian-sync-trakt",
      name: "Obsidian Sync Trakt",
      iconUrl: "https://example.com/icon.png",
      defaultGroup: "personal"
    },
    channels: {
      phone: {
        type: "bark" as const,
        endpoint: "https://api.day.app",
        deviceKey: "user-device-key"
      }
    },
    groups: {
      personal: {
        label: "Obsidian",
        channels: ["phone"]
      }
    }
  };
}

function portableMessage() {
  return {
    config: portableConfig(),
    message: {
      eventType: "sync.completed",
      title: "Done",
      message: "Changed",
      changed: true,
      presentation: {
        url: "obsidian://open?vault=Main",
        tags: ["obsidian", "sync"]
      }
    }
  };
}
