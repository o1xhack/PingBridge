# REST API

PingBridge 提供小而稳定的 REST API，供 App、插件、CLI 和 Agent 调用。

## Endpoint Index

| Method | Path                             | 是否发送通知   | 用途                                             |
| ------ | -------------------------------- | -------------- | ------------------------------------------------ |
| `GET`  | `/v1/health`                     | 否             | 检查服务是否可达。                               |
| `POST` | `/v1/configs/health`             | 否             | 校验用户自己的 portable provider config。        |
| `POST` | `/v1/messages/preview`           | 否             | 校验 portable config、message、routing、dedupe。 |
| `POST` | `/v1/messages`                   | 取决于 routing | 使用用户渠道配置发送真实消息。                   |
| `POST` | `/v1/events/preview`             | 否             | legacy/static target：校验 YAML target event。   |
| `POST` | `/v1/events`                     | 取决于 routing | legacy/static target：提交真实 event。           |
| `GET`  | `/v1/channels`                   | 否             | 列出 YAML 配置的 channel id 和 type。            |
| `POST` | `/v1/channels/:id/test`          | 是             | 运维者测试单个 YAML channel。                    |
| `GET`  | `/v1/events/recent?limit=20`     | 否             | 查看最近 stored events。                         |
| `GET`  | `/v1/deliveries/failed?limit=20` | 否             | 查看最近 failed provider deliveries。            |
| `GET`  | `/v1/deliveries/:id`             | 否             | 查看单条 delivery result。                       |

## Auth

除 `/v1/health` 外，如果配置了 `server.appToken`，所有 endpoint 都需要 bearer token：

```http
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

## API 模式

| 模式                   | Endpoint                                                     | 适用场景                                                                      |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Portable user config   | `/v1/configs/health`、`/v1/messages/preview`、`/v1/messages` | App/plugin。App 保存用户选择的 Bark、Telegram、ntfy config，传给 PingBridge。 |
| Service-managed target | `/v1/events/preview`、`/v1/events`                           | CLI、MCP、可信 backend job。provider config 在 PingBridge YAML 中。           |

App/plugin 集成应优先使用 portable user config。这样插件不需要写 Bark、Telegram 或 ntfy adapter。

PingBridge 只在当前请求中使用 portable config；SQLite 里保存 normalized event 和 delivery result，不保存 Bark device key、Telegram bot token、ntfy token/topic。

## Portable User Config Payload

```json
{
  "config": {
    "app": {
      "id": "obsidian-sync-trakt",
      "name": "Obsidian Sync Trakt",
      "iconUrl": "https://example.com/obsidian-sync-trakt.png",
      "defaultGroup": "personal"
    },
    "channels": {
      "phone": {
        "type": "bark",
        "endpoint": "https://api.day.app",
        "deviceKey": "<USER_BARK_DEVICE_KEY>"
      },
      "ops_chat": {
        "type": "telegram",
        "botToken": "<USER_TELEGRAM_BOT_TOKEN>",
        "chatId": "<USER_TELEGRAM_CHAT_ID>"
      },
      "topic": {
        "type": "ntfy",
        "server": "https://ntfy.sh",
        "topic": "<USER_NTFY_TOPIC>"
      }
    },
    "groups": {
      "personal": {
        "label": "Obsidian",
        "channels": ["phone", "topic"]
      }
    },
    "defaults": {
      "group": "personal",
      "changed": true
    }
  },
  "message": {
    "eventType": "sync.completed",
    "title": "Trakt sync completed",
    "message": "Wrote 3 Daily Notes.",
    "dedupeKey": "obsidian-sync-trakt:daily-notes",
    "presentation": {
      "url": "obsidian://open?vault=Main",
      "tags": ["obsidian", "sync"]
    }
  }
}
```

`config.app.name`、`config.app.iconUrl`、group `label` 和 `message.presentation` 会用于 provider formatting。App 不需要自己拼 Bark URL、Telegram request 或 ntfy headers。

## Portable Config Health

```http
POST /v1/configs/health
```

校验 portable config，不发送通知，不写 SQLite。

Response:

```json
{
  "status": "ok",
  "app": {
    "id": "obsidian-sync-trakt",
    "name": "Obsidian Sync Trakt"
  },
  "groups": [
    {
      "id": "personal",
      "label": "Obsidian",
      "channels": [{ "id": "phone", "type": "bark", "supported": true }]
    }
  ],
  "channels": [{ "id": "phone", "type": "bark", "supported": true }],
  "warnings": []
}
```

`status: "warning"` 表示 config shape 合法，但当前 runtime 缺少某个 channel type 的 provider。

## Preview Portable Message

```http
POST /v1/messages/preview
```

校验 portable config + message，计算 routing、priority、channels、dedupe，不发送、不写 SQLite。

Response:

```json
{
  "status": "preview",
  "notify": true,
  "target": "personal",
  "priority": "normal",
  "channels": [{ "id": "phone", "type": "bark" }],
  "dedupe": {
    "key": "obsidian-sync-trakt:daily-notes",
    "duplicate": false
  },
  "app": {
    "id": "obsidian-sync-trakt",
    "name": "Obsidian Sync Trakt"
  },
  "group": "personal"
}
```

## Send Portable Message

```http
POST /v1/messages
```

用请求中的 portable user config 发送真实通知。Response status 是 `202 Accepted`。

## Standard Event Payload

`POST /v1/events` 和 `POST /v1/events/preview` 使用 legacy/static target payload：

```json
{
  "source": "obsidian-sync-trakt",
  "eventType": "sync.completed",
  "target": "me",
  "title": "Trakt sync completed",
  "message": "Wrote 3 Daily Notes.",
  "severity": "info",
  "changed": true,
  "dedupeKey": "obsidian-sync-trakt:daily-notes"
}
```

这些 endpoint 只适合 provider config 已经写在 PingBridge YAML 的场景。

## Routing

默认会发送：

- `severity: error`
- `eventType` 以 `.failed` 结尾
- `eventType` 是 `auth.expired`
- `changed: true`
- 命中配置规则

普通 `changed: false` success event 会记录为 `ignored`。

## Errors

常见错误：

| HTTP  | Code                       | 原因                                              |
| ----- | -------------------------- | ------------------------------------------------- |
| `400` | `invalid_json`             | 请求不是合法 JSON。                               |
| `400` | `invalid_event`            | event 字段缺失或非法。                            |
| `400` | `invalid_config`           | portable config 缺失、非法或引用未知 channel。    |
| `400` | `invalid_portable_message` | portable message 请求体非法。                     |
| `400` | `unknown_group`            | message 引用了 `config.groups` 中不存在的 group。 |
| `400` | `unknown_target`           | legacy/static target 未配置。                     |
| `401` | `unauthorized`             | bearer token 缺失或错误。                         |
| `404` | `not_found`                | route 不存在。                                    |
