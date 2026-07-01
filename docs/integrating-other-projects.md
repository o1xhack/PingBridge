# Integrating Other Projects

PingBridge is a Backend Notification as a Service for apps and plugins.

The app should not implement Bark, Telegram, or ntfy provider adapters. The app collects user notification settings, passes them to PingBridge as portable config, and lets PingBridge handle provider-specific APIs, formatting, routing, retry, dedupe, and delivery logs.

## What The App Gets

After integration, an app can:

- let each end user choose Bark, Telegram, ntfy, or multiple channels
- brand notifications with an app name, icon, group label, click URL, and tags
- run a config health check without sending a push
- preview one message without sending a push
- send real notifications through one SDK call
- avoid shipping duplicated provider adapter code in every plugin

The app still owns its settings UI and local storage. PingBridge owns provider delivery.

## Current MVP Install Path

The client package is ready to publish, but it has not been published to npm yet.

Once published:

```bash
npm install @pingbridge/client
```

Before npm publish, use a local tarball from this repository:

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @pingbridge/client --pack-destination /tmp
```

Then in another project:

```bash
npm install /tmp/pingbridge-client-1.0.0.tgz
```

The import path is the same either way:

```ts
import { PingBridgeClient } from "@pingbridge/client";
```

## App Settings

Recommended settings shape:

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

Keep provider values in the user's local settings or secret store. Do not commit them, print them, put them in event metadata, or send them to unrelated services.

## Build Portable Config

Convert the app settings into a PingBridge portable config:

```ts
import type { PortableNotificationConfig } from "@pingbridge/client";

function buildPingBridgeConfig(settings: PingBridgeSettings): PortableNotificationConfig {
  const channels: PortableNotificationConfig["channels"] = {};

  if (settings.channels.bark?.enabled) {
    channels.bark_phone = {
      type: "bark",
      endpoint: settings.channels.bark.endpoint,
      deviceKey: settings.channels.bark.deviceKey
    };
  }

  if (settings.channels.telegram?.enabled) {
    channels.telegram_chat = {
      type: "telegram",
      botToken: settings.channels.telegram.botToken,
      chatId: settings.channels.telegram.chatId
    };
  }

  if (settings.channels.ntfy?.enabled) {
    channels.ntfy_topic = {
      type: "ntfy",
      server: settings.channels.ntfy.server,
      topic: settings.channels.ntfy.topic,
      token: settings.channels.ntfy.token
    };
  }

  return {
    app: {
      id: "obsidian-sync-trakt",
      name: settings.appName || "Obsidian Sync Trakt",
      iconUrl: settings.appIconUrl,
      defaultGroup: settings.defaultGroup || "personal"
    },
    channels,
    groups: {
      personal: {
        label: "Obsidian",
        iconUrl: settings.appIconUrl,
        channels: Object.keys(channels)
      }
    },
    defaults: {
      group: "personal",
      changed: true
    }
  };
}
```

If `channels` is empty, show a settings error before calling PingBridge.

## Three-Step Integration Test

Use this order in third-party projects.

### 1. Service Health

Checks that PingBridge is reachable. This does not validate user provider config and does not send a notification.

```ts
const ping = new PingBridgeClient({
  endpoint: settings.endpoint,
  token: settings.appToken
});

await ping.health();
```

### 2. Config Health

Checks portable config shape, groups, channel references, and whether this PingBridge runtime has providers for the requested channel types. This does not send a notification.

```ts
const config = buildPingBridgeConfig(settings);
const result = await ping.checkConfig(config);

if (result.status === "warning") {
  console.warn(result.warnings.join("\n"));
}
```

If this fails, fix the token, config shape, empty channels, or group references before attempting a real notification.

### 3. Preview Then Send

Preview one message before sending it:

```ts
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

`previewMessage(...)` does not write SQLite rows and does not send provider notifications.

`sendMessage(...)` sends a real notification if routing says it should notify.

## Failure and Auth Expired

```ts
await ping.sendMessage({
  config,
  message: {
    eventType: "sync.failed",
    title: "Trakt sync failed",
    message: "OAuth invalid_grant",
    severity: "error",
    changed: true,
    dedupeKey: "obsidian-sync-trakt:failure"
  }
});

await ping.sendMessage({
  config,
  message: {
    eventType: "auth.expired",
    title: "Trakt authorization expired",
    message: "Reconnect Trakt before the next sync.",
    severity: "error",
    changed: true
  }
});
```

## Minimal Drop-In Helper

This pattern keeps app code small and testable:

```ts
import { PingBridgeClient, PingBridgeClientError, type PortableNotificationConfig } from "@pingbridge/client";

export async function sendPingBridgeMessage(
  settings: PingBridgeSettings,
  message: Parameters<PingBridgeClient["sendMessage"]>[0]["message"]
): Promise<void> {
  if (!settings.enabled) return;

  const ping = new PingBridgeClient({
    endpoint: settings.endpoint,
    token: settings.appToken
  });
  const config: PortableNotificationConfig = buildPingBridgeConfig(settings);

  try {
    await ping.sendMessage({ config, message });
  } catch (error) {
    if (error instanceof PingBridgeClientError) {
      console.warn(`PingBridge failed: ${error.status} ${error.code}: ${error.message}`);
      return;
    }
    throw error;
  }
}
```

For settings screens, use `ping.health()`, `ping.checkConfig(...)`, and `ping.previewMessage(...)` for a "Test connection" button. Do not use `sendMessage(...)` as the first test because it sends a real push.

## Event Naming

Prefer stable dotted event names:

| Scenario                        | Example                                |
| ------------------------------- | -------------------------------------- |
| Successful sync with changes    | `sync.completed` with `changed: true`  |
| Successful sync with no changes | `sync.completed` with `changed: false` |
| Failed sync                     | `sync.failed`                          |
| Expired OAuth token             | `auth.expired`                         |
| Background job completed        | `job.completed`                        |
| Background job failed           | `job.failed`                           |

Use `dedupeKey` for events that may retry or repeat. Good keys usually include the app id, event type, and relevant date or object id.

## External Consumer Smoke Test

PingBridge includes a quiet external consumer test:

```bash
npm run test:external
```

This test creates a temporary outside project, installs the packed `@pingbridge/client` tarball, starts a local PingBridge HTTP server with fake provider delivery, calls `health`, `checkConfig`, `previewMessage`, and `sendMessage`, and verifies that preview does not send while send does.

It proves the SDK can be installed and used by another project without relying on workspace imports or app-side provider adapters.
