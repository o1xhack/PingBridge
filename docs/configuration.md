# Configuration

PingBridge loads YAML from `PINGBRIDGE_CONFIG`, or `pingbridge.config.yaml` by default.

Environment placeholders are expanded with `${NAME}` before YAML parsing.

## Server

```yaml
server:
  host: 127.0.0.1
  port: 8787
  appToken: ${PINGBRIDGE_TOKEN}
  databasePath: ./data/pingbridge.sqlite
  dedupeWindowSeconds: 3600
  deliveryRetries: 3
  deliveryRetryDelayMs: 250
  requestTimeoutMs: 10000
```

`appToken` is strongly recommended. If omitted or empty, REST endpoints are unauthenticated except for provider-side secrets.

## Channels

Telegram Bot:

```yaml
channels:
  telegram_main:
    type: telegram
    botToken: ${TELEGRAM_BOT_TOKEN}
    chatId: ${TELEGRAM_CHAT_ID}
```

Bark:

```yaml
channels:
  bark_iphone:
    type: bark
    endpoint: https://api.day.app
    deviceKey: ${BARK_DEVICE_KEY}
```

ntfy:

```yaml
channels:
  ntfy_personal:
    type: ntfy
    server: https://ntfy.sh
    topic: ${NTFY_TOPIC}
    token: ${NTFY_TOKEN}
```

`ntfy.token` is optional for public topics, but private topics are recommended.

## Targets

Targets are stable names that callers use instead of channel ids.

```yaml
targets:
  me:
    channels:
      - telegram_main
      - bark_iphone
      - ntfy_personal
```

## Rules

Rules are evaluated in order. A matching rule forces notification delivery and can override the event target.

```yaml
rules:
  - match:
      eventType: sync.failed
    target: me
    priority: high

  - match:
      eventType: auth.expired
    target: me
    priority: high

  - match:
      eventType: sync.completed
      changed: true
    target: me
    priority: normal
```

Supported match fields:

- `source`
- `eventType`
- `target`
- `changed`
- `severity`

Supported priority values:

- `low`
- `normal`
- `high`

## Default MVP Routing

If no rule matches, PingBridge still delivers:

- `severity: error`
- event types ending in `.failed`
- `auth.expired`
- any event with `changed: true`

Normal successful events with `changed: false` are stored as `ignored`.

## Dedupe

When an event has `dedupeKey`, PingBridge checks accepted events inside `server.dedupeWindowSeconds`. A repeated key is stored as `deduplicated` and is not delivered.
