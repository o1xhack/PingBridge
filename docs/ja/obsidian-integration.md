# Obsidian 連携

Obsidian plugin は PingBridge TypeScript client に依存し、portable user config を PingBridge service に渡します。plugin は Bark、ntfy、Telegram HTTP adapter を実装しません。

## Plugin Settings

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

これらの値は user local plugin settings または secret store にだけ保存してください。event metadata や logs には書かないでください。

## Client

```ts
import { PingBridgeClient, type PortableNotificationConfig } from "@o1x/pingbridge-client";

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

settings 画面の test button では `health`、`checkConfig`、`previewMessage` を先に使います。

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

実送信テストは別の明示的な user action にしてください。

## Events

成功かつ変更あり：

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

失敗：

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

認証期限切れ：

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

## 推奨挙動

- `changed: false` の成功 sync は通常ユーザーを邪魔しない。
- failure と `auth.expired` は high priority で送る。
- 重複し得る event には `dedupeKey` を使う。
- plugin UI では "Test connection" と "Send test notification" を明確に分ける。
