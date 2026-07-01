# REST API

PingBridge は App、plugin、CLI、agent 向けの小さな REST API を公開します。

## Endpoint Index

| Method | Path                             | 通知送信       | 用途                                               |
| ------ | -------------------------------- | -------------- | -------------------------------------------------- |
| `GET`  | `/v1/health`                     | いいえ         | service reachability を確認する。                  |
| `POST` | `/v1/configs/health`             | いいえ         | user-owned portable provider config を検証する。   |
| `POST` | `/v1/messages/preview`           | いいえ         | portable config、message、routing、dedupe を検証。 |
| `POST` | `/v1/messages`                   | routing に従う | user channel config で実 message を送信する。      |
| `POST` | `/v1/events/preview`             | いいえ         | legacy/static target の YAML target event を検証。 |
| `POST` | `/v1/events`                     | routing に従う | legacy/static target の実 event を送信。           |
| `GET`  | `/v1/channels`                   | いいえ         | YAML configured channel id と type を一覧する。    |
| `POST` | `/v1/channels/:id/test`          | はい           | operator が 1 つの YAML channel を test する。     |
| `GET`  | `/v1/events/recent?limit=20`     | いいえ         | 最近の stored events を見る。                      |
| `GET`  | `/v1/deliveries/failed?limit=20` | いいえ         | 最近の failed provider deliveries を見る。         |
| `GET`  | `/v1/deliveries/:id`             | いいえ         | 1 件の delivery result を見る。                    |

## Auth

`/v1/health` 以外は、`server.appToken` が設定されている場合 bearer token が必要です。

```http
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

## API Modes

| Mode                   | Endpoint                                                     | Use Case                                                                                    |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Portable user config   | `/v1/configs/health`, `/v1/messages/preview`, `/v1/messages` | App/plugin。App が user-selected Bark、Telegram、ntfy config を保存して PingBridge に渡す。 |
| Service-managed target | `/v1/events/preview`, `/v1/events`                           | CLI、MCP、trusted backend job。provider config は PingBridge YAML にある。                  |

App/plugin integration では portable user config を使ってください。plugin は Bark、Telegram、ntfy adapter を実装しません。

PingBridge は portable config を current request でだけ使います。SQLite には normalized event と delivery result を保存しますが、Bark device key、Telegram bot token、ntfy token/topic は保存しません。

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

`config.app.name`、`config.app.iconUrl`、group `label`、`message.presentation` は provider formatting に使われます。App 側で Bark URL、Telegram request、ntfy headers を組み立てる必要はありません。

## Portable Config Health

```http
POST /v1/configs/health
```

portable config を検証します。通知は送らず、SQLite にも書きません。

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

`status: "warning"` は config shape が valid だが、この runtime に一部 channel type の provider がないことを意味します。

## Preview Portable Message

```http
POST /v1/messages/preview
```

portable config + message を検証し、routing、priority、channels、dedupe を計算します。通知は送らず、SQLite にも書きません。

## Send Portable Message

```http
POST /v1/messages
```

request 内の portable user config を使って実 notification を送ります。Response status は `202 Accepted` です。

## Standard Event Payload

`POST /v1/events` と `POST /v1/events/preview` は legacy/static target payload を使います。

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

これらは provider config が PingBridge YAML にある場合に使います。

## Routing

default で送信されるもの：

- `severity: error`
- `eventType` が `.failed` で終わる
- `eventType` が `auth.expired`
- `changed: true`
- configured rule が match

通常の `changed: false` success event は `ignored` として記録されます。

## Errors

代表的な error：

| HTTP  | Code                       | Cause                                                               |
| ----- | -------------------------- | ------------------------------------------------------------------- |
| `400` | `invalid_json`             | body が valid JSON ではない。                                       |
| `400` | `invalid_event`            | event fields が missing または invalid。                            |
| `400` | `invalid_config`           | portable config が missing/invalid、または unknown channel を参照。 |
| `400` | `invalid_portable_message` | portable message request body が invalid。                          |
| `400` | `unknown_group`            | message が `config.groups` にない group を参照。                    |
| `400` | `unknown_target`           | legacy/static target が未設定。                                     |
| `401` | `unauthorized`             | bearer token が missing または invalid。                            |
| `404` | `not_found`                | route が存在しない。                                                |
