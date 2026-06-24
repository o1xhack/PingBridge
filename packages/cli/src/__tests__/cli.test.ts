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
