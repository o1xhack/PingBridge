# Architecture

PingBridge is a REST-first notification gateway. A caller sends a standard event once, and PingBridge decides whether and where to deliver it.

## Runtime Flow

1. A client sends `POST /v1/events` with a bearer token.
2. The server validates the event payload.
3. Rules are evaluated in order.
4. If no rule matches, PingBridge uses default MVP behavior:
   - `severity: error` is delivered.
   - event types ending in `.failed` are delivered.
   - `auth.expired` is delivered.
   - `changed: true` is delivered.
   - normal `changed: false` events are recorded but not delivered.
5. If `dedupeKey` is present and was already accepted inside the configured window, the event is stored as `deduplicated` and no delivery is attempted.
6. The event is written to SQLite.
7. Each target channel receives a provider delivery attempt.
8. Failed provider calls are retried according to server config.
9. Delivery results are written to SQLite.

## Packages

```text
server
  config.ts      YAML loading, env expansion, config validation
  database.ts    SQLite schema and event/delivery persistence
  providers.ts   Telegram, Bark, and ntfy HTTP providers
  service.ts     routing, dedupe, retry, delivery orchestration
  http.ts        REST API server

client-js
  index.ts       TypeScript HTTP client

cli
  index.ts       command-line wrapper around client-js

mcp-server
  index.ts       MCP stdio server
  tools.ts       testable MCP tool handlers
```

## Data Store

SQLite contains two tables:

- `events`: one row per accepted request, including ignored and deduplicated events.
- `deliveries`: one row per channel delivery attempt result.

Provider secrets are never stored in SQLite. They come from YAML configuration after environment expansion.

## Non-Goals for 1.0

- Web UI
- hosted SaaS
- multi-user accounts
- workflow orchestration
- provider-specific SDKs in third-party apps
- language-specific SDKs beyond TypeScript
