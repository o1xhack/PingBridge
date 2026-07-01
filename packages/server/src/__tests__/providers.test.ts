import { afterEach, describe, expect, it, vi } from "vitest";
import { BarkProvider, formatMessage, NtfyProvider } from "../providers.js";
import type { NormalizedEvent } from "../types.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider presentation formatting", () => {
  it("passes app icon, group, url, and priority to Bark", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 200 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);

    await new BarkProvider().send(
      {
        type: "bark",
        endpoint: "https://api.day.app",
        deviceKey: "device-key"
      },
      eventFixture(),
      {
        channelId: "bark_phone",
        eventId: "evt_1",
        priority: "high",
        timeoutMs: 1000
      }
    );

    const url = new URL((fetchImpl.mock.calls[0][0] as string).replace("https://api.day.app/", "https://example.com/"));
    expect(url.pathname).toContain("/device-key/Trakt%20sync%20completed/Wrote%203%20daily%20notes.");
    expect(url.searchParams.get("level")).toBe("critical");
    expect(url.searchParams.get("icon")).toBe("https://example.com/icon.png");
    expect(url.searchParams.get("group")).toBe("Obsidian");
    expect(url.searchParams.get("url")).toBe("obsidian://open?vault=Main");
  });

  it("passes icon, click url, tags, and priority to ntfy", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "ntfy-id" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);

    await new NtfyProvider().send(
      {
        type: "ntfy",
        server: "https://ntfy.sh",
        topic: "topic"
      },
      eventFixture(),
      {
        channelId: "ntfy_topic",
        eventId: "evt_1",
        priority: "low",
        timeoutMs: 1000
      }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ntfy.sh/topic",
      expect.objectContaining({
        headers: expect.objectContaining({
          Priority: "low",
          Tags: "obsidian,sync",
          Icon: "https://example.com/icon.png",
          Click: "obsidian://open?vault=Main"
        })
      })
    );
  });

  it("includes app identity in text providers", () => {
    expect(formatMessage(eventFixture())).toContain("App: Obsidian Sync Trakt");
    expect(formatMessage(eventFixture())).toContain("Source: obsidian-sync-trakt");
    expect(formatMessage(eventFixture())).toContain("URL: obsidian://open?vault=Main");
  });
});

function eventFixture(): NormalizedEvent {
  return {
    source: "obsidian-sync-trakt",
    eventType: "sync.completed",
    target: "personal",
    title: "Trakt sync completed",
    message: "Wrote 3 daily notes.",
    severity: "info",
    changed: true,
    presentation: {
      appName: "Obsidian Sync Trakt",
      iconUrl: "https://example.com/icon.png",
      group: "Obsidian",
      url: "obsidian://open?vault=Main",
      tags: ["obsidian", "sync"]
    }
  };
}
