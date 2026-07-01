# 設定

PingBridge は既定で `pingbridge.config.yaml` を読み込みます。`PINGBRIDGE_CONFIG` で YAML path を指定することもできます。

YAML parse 前に `${NAME}` 形式の environment placeholders が展開されます。

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

`appToken` の設定を強く推奨します。空の場合、provider 側 secret 以外の REST endpoints は unauthenticated になります。

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

`ntfy.token` は public topic では任意ですが、private topic または authenticated server を推奨します。

## Targets

Targets は呼び出し側が使う安定名です。呼び出し側は channel id を知る必要がありません。

```yaml
targets:
  me:
    channels:
      - telegram_main
      - bark_iphone
      - ntfy_personal
```

## Rules

Rules は順番に評価されます。一致した rule は notification delivery を強制し、event target を上書きできます。

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

対応 match fields:

- `source`
- `eventType`
- `target`
- `changed`
- `severity`

対応 priority:

- `low`
- `normal`
- `high`

## Default MVP Routing

rule が一致しない場合でも、PingBridge は次を送信します。

- `severity: error`
- `.failed` で終わる event type
- `auth.expired`
- `changed: true` の event

通常の成功 event で `changed: false` の場合は `ignored` として保存されます。

## Dedupe

event に `dedupeKey` がある場合、PingBridge は `server.dedupeWindowSeconds` 内の accepted events を確認します。重複 key は `deduplicated` として保存され、送信されません。
