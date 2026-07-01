# 配置

PingBridge 默认读取 `pingbridge.config.yaml`，也可以通过 `PINGBRIDGE_CONFIG` 指定 YAML 路径。

YAML 解析前会展开 `${NAME}` 形式的环境变量。

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

强烈建议配置 `appToken`。如果为空，除 provider 自身 secret 外，REST endpoints 将不需要鉴权。

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

`ntfy.token` 对 public topic 是可选的，但推荐使用私有 topic 或 authenticated server。

## Targets

Targets 是调用方使用的稳定名称，调用方不需要知道 channel id。

```yaml
targets:
  me:
    channels:
      - telegram_main
      - bark_iphone
      - ntfy_personal
```

## Rules

Rules 按顺序评估。命中 rule 会强制 notification delivery，并可覆盖 event target。

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

支持的 match fields:

- `source`
- `eventType`
- `target`
- `changed`
- `severity`

支持的 priority:

- `low`
- `normal`
- `high`

## Default MVP Routing

如果没有 rule 命中，PingBridge 仍会发送：

- `severity: error`
- 以 `.failed` 结尾的 event type
- `auth.expired`
- 任意 `changed: true` event

普通成功事件且 `changed: false` 会存为 `ignored`。

## Dedupe

event 带有 `dedupeKey` 时，PingBridge 会在 `server.dedupeWindowSeconds` 内检查已接受 events。重复 key 会存为 `deduplicated`，不发送。
