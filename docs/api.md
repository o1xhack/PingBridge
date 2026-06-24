# REST API

All endpoints except health use bearer token auth when `server.appToken` is configured.

```http
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

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
Content-Type: application/json
```

Request:

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

Required fields:

- `source`
- `eventType`
- `target`
- `title`
- `message`

Optional fields:

- `severity`: `info`, `success`, `warning`, or `error`; defaults to `info`.
- `changed`: boolean; defaults to `false`.
- `dedupeKey`: string used to suppress repeated notifications within the dedupe window.
- `items`: structured detail records.
- `metadata`: arbitrary object.

Response:

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

- `delivered`
- `partial_failure`
- `failed`
- `ignored`
- `deduplicated`

## Test Channel

```http
POST /v1/channels/:id/test
```

Sends a test notification to one configured channel.

## List Channels

```http
GET /v1/channels
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
```

Returns recent stored events, including ignored and deduplicated events.

## Failed Deliveries

```http
GET /v1/deliveries/failed?limit=20
```

Returns recent failed provider deliveries.

## Delivery Status

```http
GET /v1/deliveries/:id
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
