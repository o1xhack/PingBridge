# Obsidian Integration

Obsidian plugins should depend on the PingBridge TypeScript client and pass portable user config to the PingBridge service. The plugin should not implement Bark, ntfy, or Telegram HTTP adapters.

## Settings

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  appName: string;
  appIconUrl?: string;
  notifyOnChanged: boolean;
  notifyOnFailure: boolean;
  notifyOnAuthExpired: boolean;
  channels: {
    bark?: { enabled: boolean; endpoint?: string; deviceKey: string };
    telegram?: { enabled: boolean; botToken: string; chatId: string };
    ntfy?: { enabled: boolean; server?: string; topic: string; token?: string };
  };
}
```

Store these values only in the user's local plugin settings or secret store. Do not write them into event metadata or logs.

## Client Setup

```ts
import { PingBridgeClient, type PortableNotificationConfig } from "@pingbridge/client";

const ping = new PingBridgeClient({
  endpoint: settings.endpoint,
  token: settings.appToken
});
```

## Build Config

```ts
function buildConfig(settings: PingBridgeSettings): PortableNotificationConfig {
  const channels: PortableNotificationConfig["channels"] = {};

  if (settings.channels.bark?.enabled) {
    channels.bark = {
      type: "bark",
      endpoint: settings.channels.bark.endpoint,
      deviceKey: settings.channels.bark.deviceKey
    };
  }

  if (settings.channels.telegram?.enabled) {
    channels.telegram = {
      type: "telegram",
      botToken: settings.channels.telegram.botToken,
      chatId: settings.channels.telegram.chatId
    };
  }

  if (settings.channels.ntfy?.enabled) {
    channels.ntfy = {
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
      defaultGroup: "personal"
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

## Connection Test

Use `health`, `checkConfig`, and `previewMessage` from the plugin settings screen before sending real notifications:

```ts
await ping.health();

const config = buildConfig(settings);
await ping.checkConfig(config);

await ping.previewMessage({
  config,
  message: {
    eventType: "sync.completed",
    title: "PingBridge preview",
    message: "This validates config and routing without sending.",
    changed: true
  }
});
```

## Sync Completed With Changes

```ts
if (settings.enabled && settings.notifyOnChanged && changed) {
  await ping.sendMessage({
    config: buildConfig(settings),
    message: {
      eventType: "sync.completed",
      title: "Trakt sync completed",
      message: "Wrote 3 Daily Notes.",
      dedupeKey: `obsidian-sync-trakt:${date}:daily-notes`,
      presentation: {
        url: "obsidian://open?vault=Main",
        tags: ["obsidian", "trakt"]
      }
    }
  });
}
```

## Sync Completed Without Changes

You can skip this event, or send it with `changed: false` if you want PingBridge to keep an audit record without pushing:

```ts
await ping.sendMessage({
  config: buildConfig(settings),
  message: {
    eventType: "sync.completed",
    title: "Trakt sync completed",
    message: "No changes.",
    changed: false
  }
});
```

## Failure

```ts
if (settings.enabled && settings.notifyOnFailure) {
  await ping.sendMessage({
    config: buildConfig(settings),
    message: {
      eventType: "sync.failed",
      title: "Trakt sync failed",
      message: error instanceof Error ? error.message : String(error),
      severity: "error",
      changed: true,
      dedupeKey: `obsidian-sync-trakt:${date}:failure`
    }
  });
}
```

## Auth Expired

```ts
if (settings.enabled && settings.notifyOnAuthExpired) {
  await ping.sendMessage({
    config: buildConfig(settings),
    message: {
      eventType: "auth.expired",
      title: "Trakt authorization expired",
      message: "Reconnect Trakt before the next sync.",
      severity: "error",
      changed: true
    }
  });
}
```
