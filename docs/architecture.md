# Architecture

PingBridge is a REST-first notification gateway. A caller submits one normalized message, and PingBridge decides whether and where to deliver it.

## API Modes

PingBridge has two supported modes.

### Portable User Config

This is the recommended app/plugin integration mode.

1. The app stores PingBridge endpoint/token plus the user's chosen notification channel settings.
2. The app calls `POST /v1/configs/health` to validate portable config without sending.
3. The app calls `POST /v1/messages/preview` to validate one message, group routing, priority, and dedupe without sending.
4. The app calls `POST /v1/messages` for real delivery.
5. PingBridge converts the portable config into an in-memory runtime config for that request.
6. Provider secrets from portable config are used for delivery but are not persisted in SQLite.

### Service-Managed Targets

This mode remains useful for CLIs, MCP automation, and trusted backend jobs.

1. A service operator configures `channels`, `targets`, and `rules` in YAML.
2. The caller sends `POST /v1/events/preview` or `POST /v1/events` with a target id.
3. PingBridge resolves the target against the service YAML config.

## Runtime Flow

1. The server validates auth and request JSON.
2. Portable requests validate `config.app`, `config.channels`, `config.groups`, and message shape.
3. Standard event requests validate `source`, `eventType`, `target`, `title`, and `message`.
4. Rules are evaluated in order.
5. If no rule matches, PingBridge uses default behavior:
   - `severity: error` is delivered.
   - event types ending in `.failed` are delivered.
   - `auth.expired` is delivered.
   - `changed: true` is delivered.
   - normal `changed: false` events are recorded but not delivered.
6. If `dedupeKey` is present and was already accepted inside the configured window, the event is stored as `deduplicated` and no delivery is attempted.
7. The event is written to SQLite for real send requests.
8. Each selected channel receives a provider delivery attempt.
9. Failed provider calls are retried according to server config.
10. Delivery results are written to SQLite.

Preview and config-health endpoints do not write SQLite rows and do not send provider notifications.

## Packages

```text
server
  config.ts      YAML loading, env expansion, config validation
  database.ts    SQLite schema and event/delivery persistence
  providers.ts   Telegram, Bark, and ntfy HTTP providers
  service.ts     portable config normalization, routing, dedupe, retry, delivery orchestration
  http.ts        REST API server

client-js
  index.ts       TypeScript HTTP client

cli
  index.ts       command-line wrapper around static event client methods

mcp-server
  index.ts       MCP stdio server
  tools.ts       testable MCP tool handlers
```

## Data Store

SQLite contains two tables:

- `events`: one row per real send request, including ignored and deduplicated events.
- `deliveries`: one row per channel delivery attempt result.

Static YAML provider secrets are loaded from the server environment. Portable user config secrets are supplied per request. Neither path stores provider secrets in SQLite event payloads.

## Non-Goals for 1.0

- Web UI
- hosted SaaS account system
- multi-tenant user accounts
- workflow orchestration comparable to Novu or Knock
- provider-specific SDKs in third-party apps
- language-specific SDKs beyond TypeScript
