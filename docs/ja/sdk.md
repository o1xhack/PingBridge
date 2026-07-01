# TypeScript SDK

`@pingbridge/client` は TypeScript / JavaScript アプリ向けの推奨連携方法です。

SDK は HTTP 経由で PingBridge service を呼び出します。Bark、ntfy、Telegram を直接呼び出しません。アプリ側はユーザーが選んだ channel config を保存し、それを portable config として PingBridge に渡します。

## Install

npm publish 後：

```bash
npm install @pingbridge/client
```

npm publish 前は repository の packed tarball を使います。

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @pingbridge/client --pack-destination /tmp
cd /path/to/your/app
npm install /tmp/pingbridge-client-1.0.0.tgz
```

## Client 作成

```ts
import { PingBridgeClient } from "@pingbridge/client";

const ping = new PingBridgeClient({
  endpoint: "http://127.0.0.1:8787",
  token: process.env.PINGBRIDGE_TOKEN
});
```

## Portable User Config

これは App/plugin integration の推奨契約です。

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
```

provider token を `message`、`items`、`metadata`、title、logs に入れないでください。PingBridge は portable config をその request で使いますが、Bark device key、Telegram bot token、ntfy token/topic を SQLite event payload には保存しません。

## 推奨連携フロー

```ts
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

`checkConfig(...)` は user channel config を検証し、通知を送りません。

`previewMessage(...)` は config と 1 件の message を検証し、通知を送らず SQLite にも書きません。

`sendMessage(...)` は実通知を送ります。

## Methods

| Method                          | 通知送信       | 用途                                                                    |
| ------------------------------- | -------------- | ----------------------------------------------------------------------- |
| `health()`                      | いいえ         | service reachability を確認する。                                       |
| `checkConfig(config)`           | いいえ         | portable user provider config と provider support を確認。              |
| `previewMessage(input)`         | いいえ         | portable config + message を検証する。                                  |
| `sendMessage(input)`            | routing に従う | user channel config で実 message を送信する。                           |
| `preview(input)`                | いいえ         | legacy/static target の payload/routing 検証。                          |
| `notify(input)`                 | routing に従う | legacy/static target の実 event 送信。                                  |
| `changed(input)`                | はい           | `notify({ ...input, changed: true })` の shortcut。                     |
| `failed(input)`                 | はい           | error / failure event の shortcut。                                     |
| `authExpired(input)`            | はい           | `eventType: "auth.expired"` の shortcut。                               |
| `test(channelId)`               | はい           | operator 向け YAML channel test。通常の app integration test ではない。 |
| `listChannels()`                | いいえ         | YAML channel id と provider type を一覧する。                           |
| `recent(limit)`                 | いいえ         | 最近の stored events を読む。                                           |
| `failedDeliveries(limit)`       | いいえ         | 最近の failed deliveries を読む。                                       |
| `getDeliveryStatus(deliveryId)` | いいえ         | 1 件の delivery を読む。                                                |

## エラーハンドリング

HTTP 失敗時は `PingBridgeClientError` が throw されます。

```ts
import { PingBridgeClientError } from "@pingbridge/client";

try {
  await ping.checkConfig(config);
} catch (error) {
  if (error instanceof PingBridgeClientError) {
    console.error(error.status, error.code, error.message);
  } else {
    throw error;
  }
}
```

代表的な `code` は `unauthorized`、`invalid_json`、`invalid_event`、`invalid_config`、`invalid_portable_message`、`unknown_group`、`unknown_target`、`not_found`、`internal_error` です。

## App Settings

アプリやプラグインは PingBridge service settings とユーザー自身の notification channel settings を公開します。ただし provider HTTP calls は実装しません。

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

これらの値はユーザーの local settings または secret store に保存してください。repository に commit したり、logs に出したり、event metadata に入れたりしないでください。
