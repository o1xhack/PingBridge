# Obsidian 接入

Obsidian 插件应依赖 PingBridge TypeScript client，并把 portable user config 传给 PingBridge service。插件不应该实现 Bark、ntfy 或 Telegram HTTP adapter。

## 插件设置

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

这些值只应保存在用户本地 plugin settings 或 secret store。不要写入 event metadata 或日志。

## Client

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
    defaults: { group: "personal", changed: true }
  };
}
```

## Test Connection

设置页测试按钮应先做 `health`、`checkConfig`、`previewMessage`：

```ts
const config = buildConfig(settings);

await ping.health();
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

真实发送测试应是单独、明确的用户动作。

## Events

成功且有变化：

```ts
await ping.sendMessage({
  config: buildConfig(settings),
  message: {
    eventType: "sync.completed",
    title: "Trakt sync completed",
    message: "Wrote 3 Daily Notes.",
    dedupeKey: "obsidian-sync-trakt:2026-06-24",
    presentation: {
      url: "obsidian://open?vault=Main",
      tags: ["obsidian", "trakt"]
    }
  }
});
```

失败：

```ts
await ping.sendMessage({
  config: buildConfig(settings),
  message: {
    eventType: "sync.failed",
    title: "Trakt sync failed",
    message: "OAuth invalid_grant",
    severity: "error",
    changed: true
  }
});
```

授权过期：

```ts
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
```

## 推荐行为

- `changed: false` 的成功 sync 通常不应打扰用户。
- failure 和 `auth.expired` 应高优先级发送。
- 对可能重复的事件使用 `dedupeKey`。
- 插件 UI 应清楚区分 “Test connection” 和 “Send test notification”。
