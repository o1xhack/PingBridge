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

  it("throws structured errors", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { code: "unauthorized", message: "No token" } }), { status: 401 });
    }) as unknown as typeof fetch;
    const client = new PingBridgeClient({ endpoint: "http://localhost:8787", fetch: fetchImpl });

    await expect(client.recent()).rejects.toMatchObject(new PingBridgeClientError(401, "unauthorized", "No token"));
  });
});
