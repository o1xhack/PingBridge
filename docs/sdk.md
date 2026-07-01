# TypeScript SDK

The `@pingbridge/client` package is the recommended integration path for TypeScript and JavaScript apps.

It talks to a running PingBridge service over HTTP. It does not send Bark, ntfy, or Telegram notifications directly.

## Install

After npm publishing:

```bash
npm install @pingbridge/client
```

Before npm publishing, install the packed tarball from this repository:

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @pingbridge/client --pack-destination /tmp
cd /path/to/your/app
npm install /tmp/pingbridge-client-0.1.0.tgz
```

The import path is the same in both cases:

```ts
import { PingBridgeClient } from "@pingbridge/client";
```

## Create A Client

```ts
const ping = new PingBridgeClient({
  endpoint: "http://127.0.0.1:8787",
  token: process.env.PINGBRIDGE_TOKEN
});
```

Options:

| Option     | Required | Meaning                                                                              |
| ---------- | -------- | ------------------------------------------------------------------------------------ |
| `endpoint` | yes      | Base URL of the PingBridge service. Trailing slashes are removed automatically.      |
| `token`    | no       | Bearer token matching `server.appToken`. Required when the service has auth enabled. |
| `fetch`    | no       | Custom fetch implementation for tests or unusual runtimes.                           |

## Standard Event Input

```ts
interface NotifyInput {
  source: string;
  eventType: string;
  target: string;
  title: string;
  message: string;
  severity?: "info" | "success" | "warning" | "error";
  changed?: boolean;
  dedupeKey?: string;
  items?: unknown[];
  metadata?: Record<string, unknown>;
}
```

Use stable names for `source`, `eventType`, and `dedupeKey`. Do not include access tokens, passwords, one-time codes, or private contact details in event payloads because events are stored in SQLite.

## Recommended Integration Flow

```ts
await ping.health();

const preview = await ping.preview({
  source: "my-app",
  eventType: "task.completed",
  target: "me",
  title: "Task completed",
  message: "This checks routing without sending.",
  changed: true,
  dedupeKey: "my-app:task.completed:2026-06-30"
});

if (preview.notify) {
  await ping.notify({
    source: "my-app",
    eventType: "task.completed",
    target: "me",
    title: "Task completed",
    message: "This sends a real notification.",
    changed: true,
    dedupeKey: "my-app:task.completed:2026-06-30"
  });
}
```

`preview(...)` is safe for connection-test buttons because it does not write to SQLite and does not send provider notifications.

`notify(...)` is the real event submission method.

## Methods

| Method                          | Sends Notification          | Use                                                              |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `health()`                      | No                          | Check that the service is reachable.                             |
| `preview(input)`                | No                          | Validate payload, auth, target, routing, priority, and dedupe.   |
| `notify(input)`                 | Yes, if routing says notify | Submit a real event.                                             |
| `changed(input)`                | Yes                         | Shortcut for `notify({ ...input, changed: true })`.              |
| `failed(input)`                 | Yes                         | Shortcut for error/failure events.                               |
| `authExpired(input)`            | Yes                         | Shortcut for `eventType: "auth.expired"`.                        |
| `test(channelId)`               | Yes                         | Operator-only channel test. Not the normal app integration test. |
| `listChannels()`                | No                          | List configured channel ids and provider types.                  |
| `recent(limit)`                 | No                          | Read recent stored events.                                       |
| `failedDeliveries(limit)`       | No                          | Read recent failed provider deliveries.                          |
| `getDeliveryStatus(deliveryId)` | No                          | Read one delivery row.                                           |

## Response Shapes

`notify(...)`, `changed(...)`, `failed(...)`, `authExpired(...)`, and `test(...)` return:

```ts
interface NotifyResponse {
  eventId: string;
  status: "accepted" | "delivered" | "partial_failure" | "failed" | "ignored" | "deduplicated";
  deliveries: DeliverySummary[];
}
```

`preview(...)` returns:

```ts
interface EventPreviewResponse {
  status: "preview";
  notify: boolean;
  target: string;
  priority: "low" | "normal" | "high";
  channels: Array<{ id: string; type: "telegram" | "bark" | "ntfy" }>;
  dedupe: {
    key?: string;
    duplicate: boolean;
  };
}
```

## Error Handling

Failed HTTP responses throw `PingBridgeClientError`:

```ts
import { PingBridgeClientError } from "@pingbridge/client";

try {
  await ping.preview({
    source: "my-app",
    eventType: "task.completed",
    target: "me",
    title: "Task completed",
    message: "Check routing.",
    changed: true
  });
} catch (error) {
  if (error instanceof PingBridgeClientError) {
    console.error(error.status, error.code, error.message);
  } else {
    throw error;
  }
}
```

Common `PingBridgeClientError.code` values include `unauthorized`, `invalid_json`, `invalid_event`, `not_found`, and `internal_error`.

## App Settings Example

Apps and plugins should expose only PingBridge service settings:

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
}
```

Provider configuration belongs on the PingBridge service, not in the app.
