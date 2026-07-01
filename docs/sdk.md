# TypeScript SDK

The `@o1x/pingbridge-client` package is the recommended integration path for TypeScript and JavaScript apps.

It talks to a running PingBridge service over HTTP. It does not send Bark, ntfy, or Telegram notifications directly.

## Choose A Flow

Use the portable user config flow for app/plugin integrations. Your app stores the user's selected channels, passes that config to PingBridge, and PingBridge handles Bark, Telegram, and ntfy provider APIs.

Use the standard event flow only when the PingBridge service operator already manages all channels and targets in YAML.

## Install

After npm publishing:

```bash
npm install @o1x/pingbridge-client
```

Before npm publishing, install the packed tarball from this repository:

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @o1x/pingbridge-client --pack-destination /tmp
cd /path/to/your/app
npm install /tmp/o1x-pingbridge-client-1.0.0.tgz
```

The import path is the same in both cases:

```ts
import { PingBridgeClient } from "@o1x/pingbridge-client";
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

## Portable User Config Input

This is the recommended contract for projects such as Obsidian plugins.

```ts
interface PortableNotificationConfig {
  app: {
    id: string;
    name: string;
    iconUrl?: string;
    defaultGroup?: string;
  };
  channels: Record<string, ChannelConfig>;
  groups?: Record<string, { channels: string[]; label?: string; iconUrl?: string }>;
  defaults?: {
    group?: string;
    severity?: "info" | "success" | "warning" | "error";
    changed?: boolean;
  };
}

type ChannelConfig =
  | { type: "bark"; endpoint?: string; deviceKey: string }
  | { type: "telegram"; botToken: string; chatId: string; parseMode?: "Markdown" | "MarkdownV2" | "HTML" }
  | { type: "ntfy"; server?: string; topic: string; token?: string };

interface PortableNotificationInput {
  config: PortableNotificationConfig;
  message: {
    eventType: string;
    title: string;
    message: string;
    group?: string;
    severity?: "info" | "success" | "warning" | "error";
    changed?: boolean;
    dedupeKey?: string;
    items?: unknown[];
    metadata?: Record<string, unknown>;
    presentation?: {
      appName?: string;
      iconUrl?: string;
      group?: string;
      url?: string;
      tags?: string[];
    };
  };
}
```

Do not put provider tokens into `message`, `items`, `metadata`, titles, or logs. The SDK sends provider config in the request body, and PingBridge uses it for that request without storing it in SQLite.

## Portable Integration Flow

```ts
const config = {
  app: {
    id: "obsidian-sync-trakt",
    name: "Obsidian Sync Trakt",
    iconUrl: "https://example.com/obsidian-sync-trakt.png",
    defaultGroup: "personal"
  },
  channels: {
    phone: {
      type: "bark" as const,
      endpoint: "https://api.day.app",
      deviceKey: settings.barkDeviceKey
    },
    notes: {
      type: "ntfy" as const,
      server: "https://ntfy.sh",
      topic: settings.ntfyTopic
    }
  },
  groups: {
    personal: {
      label: "Obsidian",
      channels: ["phone", "notes"]
    }
  },
  defaults: {
    group: "personal",
    changed: true
  }
};

await ping.health();
await ping.checkConfig(config);

const input = {
  config,
  message: {
    eventType: "sync.completed",
    title: "Trakt sync completed",
    message: "Wrote 3 Daily Notes.",
    dedupeKey: "obsidian-sync-trakt:daily-notes",
    presentation: {
      url: "obsidian://open?vault=Main",
      tags: ["obsidian", "sync"]
    }
  }
};

const preview = await ping.previewMessage(input);

if (preview.notify) {
  await ping.sendMessage(input);
}
```

`checkConfig(...)` validates config shape, groups, channels, and provider support without sending.

`previewMessage(...)` validates config plus a message and evaluates routing without sending.

`sendMessage(...)` sends the real notification.

## Standard Event Input

Use this only for service-managed YAML targets.

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
  presentation?: NotificationPresentation;
}
```

Use stable names for `source`, `eventType`, and `dedupeKey`. Do not include access tokens, passwords, one-time codes, or private contact details in event payloads because events are stored in SQLite.

## Standard Event Flow

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

`preview(...)` is safe for static-target connection-test buttons because it does not write to SQLite and does not send provider notifications.

`notify(...)` is the real event submission method.

## Methods

| Method                          | Sends Notification          | Use                                                              |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `health()`                      | No                          | Check that the service is reachable.                             |
| `checkConfig(config)`           | No                          | Validate portable user provider config and provider support.     |
| `previewMessage(input)`         | No                          | Validate portable config plus one message without sending.       |
| `sendMessage(input)`            | Yes, if routing says notify | Submit a portable message with user-owned provider config.       |
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

`checkConfig(...)` returns:

```ts
interface PortableConfigHealthResponse {
  status: "ok" | "warning";
  app: { id: string; name: string; iconUrl?: string };
  groups: Array<{
    id: string;
    label?: string;
    iconUrl?: string;
    channels: Array<{ id: string; type: "telegram" | "bark" | "ntfy"; supported: boolean }>;
  }>;
  channels: Array<{ id: string; type: "telegram" | "bark" | "ntfy"; supported: boolean }>;
  warnings: string[];
}
```

`previewMessage(...)` returns `EventPreviewResponse` plus:

```ts
{
  app: { id: string; name: string; iconUrl?: string };
  group: string;
}
```

## Error Handling

Failed HTTP responses throw `PingBridgeClientError`:

```ts
import { PingBridgeClientError } from "@o1x/pingbridge-client";

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

Apps and plugins should expose PingBridge service settings plus user-owned notification channel settings. They should not implement provider HTTP calls; they should pass the selected config to PingBridge.

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  appName: string;
  appIconUrl?: string;
  defaultGroup: string;
  channels: {
    bark?: {
      enabled: boolean;
      endpoint?: string;
      deviceKey: string;
    };
    telegram?: {
      enabled: boolean;
      botToken: string;
      chatId: string;
    };
    ntfy?: {
      enabled: boolean;
      server?: string;
      topic: string;
      token?: string;
    };
  };
}
```

Keep these settings in the user's local app settings or the user's chosen secret store. Never commit them, print them, or copy them into event metadata.
