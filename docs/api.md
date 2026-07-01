# REST API

PingBridge exposes a small REST API for apps, plugins, CLIs, and agents.

Use the REST API directly when a project is not TypeScript or cannot use `@pingbridge/client`.

## Endpoint Index

| Method | Path                             | Sends Notification          | Purpose                                                        |
| ------ | -------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `GET`  | `/v1/health`                     | No                          | Check that the service is reachable.                           |
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

| Field       | Type                                  | Default | Meaning                                                              |
| ----------- | ------------------------------------- | ------- | -------------------------------------------------------------------- |
| `severity`  | `info`, `success`, `warning`, `error` | `info`  | Used by default routing and provider formatting.                     |
| `changed`   | boolean                               | `false` | Whether the event represents a meaningful change.                    |
| `dedupeKey` | string                                | none    | Repeated keys inside the dedupe window are stored but not delivered. |
| `items`     | array                                 | none    | Structured details for richer logs or future formatting.             |
| `metadata`  | object                                | none    | Extra machine-readable context. Do not put secrets here.             |

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

## Send Event

```http
POST /v1/events
Authorization: Bearer <PINGBRIDGE_TOKEN>
Content-Type: application/json
```

This is the real delivery endpoint. Use `POST /v1/events/preview` first when testing an integration.

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

Use this endpoint from third-party app tests before calling `notify`.

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

| HTTP  | Code                 | Typical Cause                                               |
| ----- | -------------------- | ----------------------------------------------------------- |
| `400` | `invalid_json`       | Request body is not valid JSON.                             |
| `400` | `invalid_event`      | Required event fields are missing or invalid.               |
| `400` | `invalid_severity`   | `severity` is not `info`, `success`, `warning`, or `error`. |
| `400` | `unknown_target`     | The requested `target` is not configured.                   |
| `401` | `unauthorized`       | Missing or invalid bearer token.                            |
| `404` | `not_found`          | Route was not found.                                        |
| `404` | `channel_not_found`  | The requested channel id is not configured.                 |
| `404` | `delivery_not_found` | The requested delivery id is not stored.                    |
| `500` | `delivery_missing`   | Internal delivery persistence invariant failed.             |
| `500` | `internal_error`     | Unexpected server error.                                    |
