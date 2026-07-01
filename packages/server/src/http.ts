import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { PingBridgeError, PingBridgeService } from "./service.js";
import type { PingBridgeConfig } from "./types.js";

export function createPingBridgeHttpServer(service: PingBridgeService, config: PingBridgeConfig): Server {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/v1/health") {
        return sendJson(response, 200, { status: "ok" });
      }

      if (!isAuthorized(request, config.server?.appToken)) {
        return sendJson(response, 401, {
          error: { code: "unauthorized", message: "Missing or invalid bearer token." }
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/events") {
        const body = await readJsonBody(request);
        return sendJson(response, 202, await service.notify(body));
      }

      if (request.method === "POST" && url.pathname === "/v1/events/preview") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, service.preview(body));
      }

      if (request.method === "GET" && url.pathname === "/v1/events/recent") {
        return sendJson(response, 200, { events: service.listRecentEvents(readLimit(url)) });
      }

      if (request.method === "GET" && url.pathname === "/v1/deliveries/failed") {
        return sendJson(response, 200, { deliveries: service.listFailedDeliveries(readLimit(url)) });
      }

      const deliveryMatch = url.pathname.match(/^\/v1\/deliveries\/([^/]+)$/);
      if (request.method === "GET" && deliveryMatch) {
        return sendJson(response, 200, { delivery: service.getDeliveryStatus(decodeURIComponent(deliveryMatch[1])) });
      }

      if (request.method === "GET" && url.pathname === "/v1/channels") {
        return sendJson(response, 200, { channels: service.listChannels() });
      }

      const testMatch = url.pathname.match(/^\/v1\/channels\/([^/]+)\/test$/);
      if (request.method === "POST" && testMatch) {
        return sendJson(response, 202, await service.testChannel(decodeURIComponent(testMatch[1])));
      }

      return sendJson(response, 404, { error: { code: "not_found", message: "Route not found." } });
    } catch (error) {
      if (error instanceof PingBridgeError) {
        return sendJson(response, error.statusCode, { error: { code: error.code, message: error.message } });
      }
      const message = error instanceof Error ? error.message : String(error);
      return sendJson(response, 500, { error: { code: "internal_error", message } });
    }
  });
}

function isAuthorized(request: IncomingMessage, appToken?: string): boolean {
  if (!appToken) {
    return true;
  }
  return request.headers.authorization === `Bearer ${appToken}`;
}

function readLimit(url: URL): number {
  const value = Number(url.searchParams.get("limit") ?? "20");
  return Number.isFinite(value) ? value : 20;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PingBridgeError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}
