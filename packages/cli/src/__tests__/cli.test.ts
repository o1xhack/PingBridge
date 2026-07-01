import { describe, expect, it, vi } from "vitest";
import { runCli } from "../index.js";

describe("CLI", () => {
  it("sends notify events and prints JSON", async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body).toMatchObject({
        source: "github-commit-report",
        eventType: "sync.completed",
        target: "me",
        changed: true
      });
      return new Response(JSON.stringify({ eventId: "evt_cli", status: "delivered", deliveries: [] }), { status: 202 });
    }) as unknown as typeof fetch;

    const code = await runCli(
      [
        "notify",
        "--source",
        "github-commit-report",
        "--event",
        "sync.completed",
        "--target",
        "me",
        "--title",
        "Done",
        "--message",
        "Report ready",
        "--changed",
        "true"
      ],
      { PINGBRIDGE_ENDPOINT: "http://localhost:8787", PINGBRIDGE_TOKEN: "token" },
      { stdout, stderr },
      fetchImpl
    );

    expect(code).toBe(0);
    expect(stderr.text()).toBe("");
    expect(JSON.parse(stdout.text()).eventId).toBe("evt_cli");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8787/v1/events",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token" }) })
    );
  });

  it("returns a non-zero exit code for missing required options", async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const code = await runCli(["notify", "--source", "app"], {}, { stdout, stderr });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("Missing required option --event.");
  });

  it("previews events without sending them", async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(_url.toString()).toBe("http://localhost:8787/v1/events/preview");
      expect(JSON.parse(init?.body as string).source).toBe("app");
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

    const code = await runCli(
      [
        "preview",
        "--source",
        "app",
        "--event",
        "sync.completed",
        "--target",
        "me",
        "--title",
        "Done",
        "--message",
        "Changed",
        "--changed",
        "true"
      ],
      { PINGBRIDGE_ENDPOINT: "http://localhost:8787", PINGBRIDGE_TOKEN: "token" },
      { stdout, stderr },
      fetchImpl
    );

    expect(code).toBe(0);
    expect(stderr.text()).toBe("");
    expect(JSON.parse(stdout.text()).status).toBe("preview");
  });

  it("checks service health", async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => {
      expect(_url.toString()).toBe("http://localhost:8787/v1/health");
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;

    const code = await runCli(
      ["health"],
      { PINGBRIDGE_ENDPOINT: "http://localhost:8787" },
      { stdout, stderr },
      fetchImpl
    );

    expect(code).toBe(0);
    expect(stderr.text()).toBe("");
    expect(JSON.parse(stdout.text())).toEqual({ status: "ok" });
  });
});

function createWriter(): Pick<NodeJS.WriteStream, "write"> & { text(): string } {
  let output = "";
  return {
    write(chunk: string | Uint8Array): boolean {
      output += chunk.toString();
      return true;
    },
    text(): string {
      return output;
    }
  };
}
