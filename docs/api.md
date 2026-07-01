# REST API

PingBridge exposes a small REST API for apps, plugins, CLIs, and agents.

Use the REST API directly when a project is not TypeScript or cannot use `@pingbridge/client`.

## Endpoint Index

| Method | Path                             | Sends Notification          | Purpose                                                        |
| ------ | -------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `GET`  | `/v1/health`                     | No                          | Check that the service is reachable.                           |
| `POST` | `/v1/configs/health`             | No                          | Validate a user-owned portable provider config.                |
| `POST` | `/v1/messages/preview`           | No                          | Validate portable config, message, routing, priority, dedupe.  |
| `POST` | `/v1/messages`                   | Yes, if routing says notify | Submit a message with user-owned provider config.              |
| `POST` | `/v1/events/preview`             | No                          | Validate payload, auth, target, routing, priority, and dedupe. |
| `POST` | `/v1/events`                     | Yes, if routing says notify | Submit a real event.                                           |
| `GET`  | `/v1/channels`                   | No                          | List configured channel ids and types.                         |
| `POST` | `/v1/channels/:id/test`          | Yes                         | Send a test message to one provider channel.                   |
| `GET`  | `/v1/events/recent?limit=20`     | No                          | Inspect recent stored events.                                  |
| `GET`  | `/v1/deliveries/failed?limit=20` | No                          | Inspect recent failed provider deliveries.                     |
| `GET`  | `/v1/deliveries/:id`             | No                          | Inspect one delivery result.                                   |

## Auth

All endpoints except `/v1/health` use bearer token auth when `server.appToken` is configured.

```http
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

If `server.appToken` is empty, protected endpoints are unauthenticated. That is only appropriate for isolated local experiments.

## Choose An API Mode

PingBridge supports two API modes.

| Mode                   | Endpoints                                                    | Best For                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portable user config   | `/v1/configs/health`, `/v1/messages/preview`, `/v1/messages` | App/plugin developers. The app stores user-entered Bark, Telegram, or ntfy config and passes it to PingBridge. PingBridge handles provider adapters. |
| Service-managed target | `/v1/events/preview`, `/v1/events`                           | Server operators, CLIs, MCP automation, and trusted automations where provider config lives in PingBridge YAML.                                      |

Use portable user config for product integrations such as an Obsidian plugin. The plugin can let each end user choose Bark, Telegram, ntfy, or multiple channels without shipping provider-specific adapter code.

PingBridge uses portable config only for the current request. It persists the normalized event and delivery result, but it does not persist Bark device keys, Telegram bot tokens, ntfy tokens, or ntfy topics from the portable config.

## Standard Event Payload

`POST /v1/events` and `POST /v1/events/preview` accept the same event payload.

Required fields:

| Field       | Type   | Meaning                                                                        |
| ----------- | ------ | ------------------------------------------------------------------------------ |
| `source`    | string | Stable name of the app or automation, such as `obsidian-sync-trakt`.           |
| `eventType` | string | Stable event name, such as `sync.completed`, `sync.failed`, or `auth.expired`. |
| `target`    | string | Recipient group configured under `targets` in YAML.                            |
| `title`     | string | Short notification title.                                                      |
| `message`   | string | Human-readable notification body.                                              |

Optional fields:

| Field          | Type                                  | Default | Meaning                                                              |
| -------------- | ------------------------------------- | ------- | -------------------------------------------------------------------- |
| `severity`     | `info`, `success`, `warning`, `error` | `info`  | Used by default routing and provider formatting.                     |
| `changed`      | boolean                               | `false` | Whether the event represents a meaningful change.                    |
| `dedupeKey`    | string                                | none    | Repeated keys inside the dedupe window are stored but not delivered. |
| `items`        | array                                 | none    | Structured details for richer logs or future formatting.             |
| `metadata`     | object                                | none    | Extra machine-readable context. Do not put secrets here.             |
| `presentation` | object                                | none    | Optional app name, icon, group, click URL, and provider tags.        |

Example:

```json
{
  "source": "obsidian-sync-trakt",
  "eventType": "sync.completed",
  "target": "me",
  "title": "Trakt sync completed",
  "message": "Wrote 3 Daily Notes.",
  "severity": "info",
  "changed": true,
  "dedupeKey": "obsidian-sync-trakt:2026-06-24:daily-notes",
  "items": [
    {
      "time": "09:12",
      "action": "watched",
      "title": "S01E03"
    }
  ]
}
```

## Portable User Config Payload

`POST /v1/configs/health`, `POST /v1/messages/preview`, and `POST /v1/messages` are the recommended app/plugin integration endpoints.

Portable config contains the user-selected channels. The app may store this config in its own settings store, but the app still does not call Bark, Telegram, or ntfy directly.

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
      "public_topic": {
        "type": "ntfy",
        "server": "https://ntfy.sh",
        "topic": "<USER_NTFY_TOPIC>"
      }
    },
    "groups": {
      "personal": {
        "label": "Obsidian",
        "iconUrl": "https://example.com/obsidian-sync-trakt.png",
        "channels": ["phone", "public_topic"]
      },
      "ops": {
        "channels": ["ops_chat"]
      }
    },
    "defaults": {
      "group": "personal",
      "severity": "info",
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

Config fields:

| Field                     | Required | Meaning                                                                  |
| ------------------------- | -------- | ------------------------------------------------------------------------ |
| `config.app.id`           | yes      | Stable app/plugin id used as event `source`.                             |
| `config.app.name`         | yes      | Human-readable app name shown in provider formatting when supported.     |
| `config.app.iconUrl`      | no       | Default icon URL for providers that support icons.                       |
| `config.app.defaultGroup` | no       | Default group when the message does not set `group`.                     |
| `config.channels`         | yes      | User-owned Bark, Telegram, or ntfy destinations.                         |
| `config.groups`           | no       | Named groups that map to one or more channels. Defaults to all channels. |
| `config.defaults`         | no       | Default `group`, `severity`, and `changed` values for messages.          |
| `config.rules`            | no       | Optional route rules using the same rule shape as YAML config.           |

Message fields:

| Field          | Required | Meaning                                                         |
| -------------- | -------- | --------------------------------------------------------------- |
| `eventType`    | yes      | Stable event name such as `sync.completed` or `auth.expired`.   |
| `title`        | yes      | Short notification title.                                       |
| `message`      | yes      | Human-readable body.                                            |
| `group`        | no       | Group id in `config.groups`. Overrides defaults.                |
| `severity`     | no       | `info`, `success`, `warning`, or `error`.                       |
| `changed`      | no       | Whether this should notify under default routing.               |
| `dedupeKey`    | no       | Repeated keys inside the dedupe window are stored but not sent. |
| `presentation` | no       | Overrides app display name, icon, group label, URL, or tags.    |

## Event Routing Summary

PingBridge sends by default when:

- `severity` is `error`
- `eventType` ends in `.failed`
- `eventType` is `auth.expired`
- `changed` is `true`
- a configured rule matches

Normal success events with `changed: false` are stored as `ignored`.

## Health

```http
GET /v1/health
```

Response:

```json
{
  "status": "ok"
}
```

## Portable Config Health

```http
POST /v1/configs/health
Authorization: Bearer <PINGBRIDGE_TOKEN>
Content-Type: application/json
```

Validates a portable user config without sending notifications and without writing SQLite rows.

```bash
curl -X POST http://127.0.0.1:8787/v1/configs/health \
  -H "Authorization: Bearer $PINGBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "app": {
        "id": "obsidian-sync-trakt",
        "name": "Obsidian Sync Trakt",
        "defaultGroup": "personal"
      },
      "channels": {
        "phone": {
          "type": "bark",
          "deviceKey": "<USER_BARK_DEVICE_KEY>"
        }
      },
      "groups": {
        "personal": {
          "label": "Obsidian",
          "channels": ["phone"]
        }
      }
    }
  }'
```

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
      "channels": [
        {
          "id": "phone",
          "type": "bark",
          "supported": true
        }
      ]
    }
  ],
  "channels": [
    {
      "id": "phone",
      "type": "bark",
      "supported": true
    }
  ],
  "warnings": []
}
```

`status: "warning"` means the config shape is valid, but at least one channel type has no registered provider in this PingBridge runtime.

This endpoint does not prove that a user token is accepted by Bark, Telegram, or ntfy. Use a real send only after the user explicitly asks for a test notification.

## Preview Portable Message

```http
POST /v1/messages/preview
Authorization: Bearer <PINGBRIDGE_TOKEN>
Content-Type: application/json
```

Validates portable config plus one message, evaluates routing, target group, priority, channels, and dedupe state. It does not send and does not write SQLite rows.

Response:

```json
{
  "status": "preview",
  "notify": true,
  "target": "personal",
  "priority": "normal",
  "channels": [
    {
      "id": "phone",
      "type": "bark"
    }
  ],
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
Authorization: Bearer <PINGBRIDGE_TOKEN>
Content-Type: application/json
```

Sends a real notification using the portable user config in the request. This is the normal production endpoint for apps/plugins that let end users choose their own channels.

Response status: `202 Accepted`

```json
{
  "eventId": "evt_...",
  "status": "delivered",
  "deliveries": [
    {
      "id": "dlv_...",
      "channel": "phone",
      "channelType": "bark",
      "status": "delivered",
      "attempts": 1
    }
  ]
}
```

## Send Event

```http
POST /v1/events
Authorization: Bearer <PINGBRIDGE_TOKEN>
Content-Type: application/json
```

This is the real delivery endpoint for service-managed YAML targets. Use `POST /v1/events/preview` first when testing static-target integrations.

```bash
curl -X POST http://127.0.0.1:8787/v1/events \
  -H "Authorization: Bearer $PINGBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "my-app",
    "eventType": "task.completed",
    "target": "me",
    "title": "Task completed",
    "message": "The scheduled task finished.",
    "changed": true,
    "dedupeKey": "my-app:task.completed:2026-06-30"
  }'
```

Response status: `202 Accepted`

```json
{
  "eventId": "evt_...",
  "status": "delivered",
  "deliveries": [
    {
      "id": "dlv_...",
      "channel": "ntfy_personal",
      "channelType": "ntfy",
      "status": "delivered",
      "attempts": 1
    }
  ]
}
```

Event statuses:

| Status            | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `delivered`       | Every selected channel delivered successfully.                   |
| `partial_failure` | At least one selected channel failed and at least one succeeded. |
| `failed`          | Every selected channel failed.                                   |
| `ignored`         | Routing decided not to send.                                     |
| `deduplicated`    | `dedupeKey` was already accepted inside the dedupe window.       |

## Preview Event

```http
POST /v1/events/preview
Authorization: Bearer <PINGBRIDGE_TOKEN>
Content-Type: application/json
```

Validates the same event payload shape as `POST /v1/events`, evaluates routing, target channels, priority, and dedupe state, but does not write to SQLite and does not send provider notifications.

Use this endpoint for service-managed YAML target integrations. App/plugin integrations that pass user-owned provider config should use `POST /v1/messages/preview`.

```bash
curl -X POST http://127.0.0.1:8787/v1/events/preview \
  -H "Authorization: Bearer $PINGBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "my-app",
    "eventType": "task.completed",
    "target": "me",
    "title": "Preview only",
    "message": "This checks routing without sending.",
    "changed": true,
    "dedupeKey": "my-app:task.completed:2026-06-30"
  }'
```

Response status: `200 OK`

Response:

```json
{
  "status": "preview",
  "notify": true,
  "target": "me",
  "priority": "normal",
  "channels": [
    {
      "id": "ntfy_personal",
      "type": "ntfy"
    }
  ],
  "dedupe": {
    "key": "obsidian-sync-trakt:2026-06-24:daily-notes",
    "duplicate": false
  }
}
```

`notify: false` means the event is valid but current routing would not send it. For example, a normal `sync.completed` event with `changed: false` is usually ignored.

## Test Channel

```http
POST /v1/channels/:id/test
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

Sends a test notification to one configured channel. This endpoint is for service operators, not normal third-party app integration tests.

Response status: `202 Accepted`

## List Channels

```http
GET /v1/channels
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

Response:

```json
{
  "channels": [
    {
      "id": "ntfy_personal",
      "type": "ntfy"
    }
  ]
}
```

## Recent Events

```http
GET /v1/events/recent?limit=20
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

Returns recent stored events, including ignored and deduplicated events.

## Failed Deliveries

```http
GET /v1/deliveries/failed?limit=20
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

Returns recent failed provider deliveries.

## Delivery Status

```http
GET /v1/deliveries/:id
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

Returns one delivery row by id.

## Errors

Error response shape:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing or invalid bearer token."
  }
}
```

Common error codes:

| HTTP  | Code                       | Typical Cause                                                          |
| ----- | -------------------------- | ---------------------------------------------------------------------- |
| `400` | `invalid_json`             | Request body is not valid JSON.                                        |
| `400` | `invalid_event`            | Required event fields are missing or invalid.                          |
| `400` | `invalid_config`           | Portable config is missing, malformed, or references unknown channels. |
| `400` | `invalid_portable_message` | Portable message request body is malformed.                            |
| `400` | `invalid_severity`         | `severity` is not `info`, `success`, `warning`, or `error`.            |
| `400` | `unknown_group`            | Portable message references a group not defined in `config.groups`.    |
| `400` | `unknown_target`           | The requested `target` is not configured.                              |
| `401` | `unauthorized`             | Missing or invalid bearer token.                                       |
| `404` | `not_found`                | Route was not found.                                                   |
| `404` | `channel_not_found`        | The requested channel id is not configured.                            |
| `404` | `delivery_not_found`       | The requested delivery id is not stored.                               |
| `500` | `delivery_missing`         | Internal delivery persistence invariant failed.                        |
| `500` | `internal_error`           | Unexpected server error.                                               |
