# 他プロジェクトへの統合

PingBridge は App/plugin 向け Backend Notification as a Service です。

App は Bark、Telegram、ntfy adapter を自前実装しません。App はユーザーの notification settings を集め、portable config として PingBridge に渡します。PingBridge が provider API、formatting、routing、retry、dedupe、delivery logs を処理します。

## 統合後にできること

- ユーザーごとに Bark、Telegram、ntfy、または複数 channel を選べる
- app name、icon、group label、click URL、tags を指定できる
- push を送らず config health check できる
- push を送らず 1 件の message を preview できる
- 1 SDK method で実通知を送れる
- plugin ごとに provider adapter を重複実装しなくてよい

App は settings UI と local storage を担当します。PingBridge は provider delivery を担当します。

## 現在の MVP Install Path

client package は publish 可能ですが、まだ npm には publish していません。

publish 後：

```bash
npm install @pingbridge/client
```

publish 前は local tarball を使います。

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @pingbridge/client --pack-destination /tmp
```

別 project で：

```bash
npm install /tmp/pingbridge-client-1.0.0.tgz
```

## App Settings

推奨 settings shape：

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  appName: string;
  appIconUrl?: string;
  defaultGroup: string;
  channels: {
    bark?: { enabled: boolean; endpoint?: string; deviceKey: string };
    telegram?: { enabled: boolean; botToken: string; chatId: string };
    ntfy?: { enabled: boolean; server?: string; topic: string; token?: string };
  };
}
```

provider values はユーザーの local settings または secret store にだけ保存してください。commit、log 出力、event metadata への保存、無関係な service への送信は禁止です。

## Portable Config を作る

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
    defaults: { group: "personal", changed: true }
  };
}
```

`channels` が空なら、PingBridge を呼ぶ前に settings error を表示してください。

## 3 Step Integration Test

### 1. Service Health

PingBridge service の到達性だけを確認します。provider config は検証せず、通知も送りません。

```ts
const ping = new PingBridgeClient({
  endpoint: settings.endpoint,
  token: settings.appToken
});

await ping.health();
```

### 2. Config Health

portable config shape、group、channel references、runtime provider support を確認します。通知は送りません。

```ts
const config = buildPingBridgeConfig(settings);
const result = await ping.checkConfig(config);

if (result.status === "warning") {
  console.warn(result.warnings.join("\n"));
}
```

### 3. Preview Then Send

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

`previewMessage(...)` は SQLite に書かず、provider notification も送りません。

`sendMessage(...)` は実 notification 送信です。

## Failure と Auth Expired

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

## Event Naming

安定した dotted event names を推奨します。

| Scenario                    | Example                             |
| --------------------------- | ----------------------------------- |
| sync success with changes   | `sync.completed` + `changed: true`  |
| sync success with no change | `sync.completed` + `changed: false` |
| sync failed                 | `sync.failed`                       |
| OAuth token expired         | `auth.expired`                      |
| background job completed    | `job.completed`                     |
| background job failed       | `job.failed`                        |

retry や重複がありえる event には `dedupeKey` を使ってください。

## External Consumer Smoke Test

```bash
npm run test:external
```

この test は temporary outside project を作り、packed `@pingbridge/client` tarball を install し、local PingBridge HTTP server を起動し、`health`、`checkConfig`、`previewMessage`、`sendMessage` を呼びます。preview は送信せず、send が fake provider を呼ぶことを検証します。
