# TypeScript SDK

`@pingbridge/client` は TypeScript / JavaScript アプリ向けの推奨連携方法です。

この SDK は HTTP 経由で実行中の PingBridge service を呼び出します。Bark、ntfy、Telegram を直接呼び出すことはありません。

## Install

npm publish 後：

```bash
npm install @pingbridge/client
```

npm publish 前は、この repository の packed tarball を使います。

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @pingbridge/client --pack-destination /tmp
cd /path/to/your/app
npm install /tmp/pingbridge-client-0.1.0.tgz
```

import path はどちらも同じです。

```ts
import { PingBridgeClient } from "@pingbridge/client";
```

## Client 作成

```ts
const ping = new PingBridgeClient({
  endpoint: "http://127.0.0.1:8787",
  token: process.env.PINGBRIDGE_TOKEN
});
```

Options：

| Option     | 必須   | 意味                                                                   |
| ---------- | ------ | ---------------------------------------------------------------------- |
| `endpoint` | はい   | PingBridge service base URL。末尾 slash は自動で削除される。           |
| `token`    | いいえ | `server.appToken` と一致する bearer token。service auth 有効時は必須。 |
| `fetch`    | いいえ | テストや特殊 runtime 向けの custom fetch。                             |

## NotifyInput

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

`source`、`eventType`、`dedupeKey` には安定した名前を使ってください。access token、password、one-time code、個人連絡先などは event payload に入れないでください。events は SQLite に保存されます。

## 推奨連携フロー

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

`preview(...)` は設定画面の「Test connection」に適しています。SQLite へ書き込まず、provider notification も送りません。

`notify(...)` は実 event submission です。

## Methods

| Method                          | 通知送信       | 用途                                                          |
| ------------------------------- | -------------- | ------------------------------------------------------------- |
| `health()`                      | いいえ         | サービス到達性を確認する。                                    |
| `preview(input)`                | いいえ         | payload、auth、target、routing、priority、dedupe を確認する。 |
| `notify(input)`                 | routing に従う | 実 event を送信する。                                         |
| `changed(input)`                | はい           | `notify({ ...input, changed: true })` の shortcut。           |
| `failed(input)`                 | はい           | error / failure event の shortcut。                           |
| `authExpired(input)`            | はい           | `eventType: "auth.expired"` の shortcut。                     |
| `test(channelId)`               | はい           | 運用者向けの channel test。通常のアプリ連携テストではない。   |
| `listChannels()`                | いいえ         | channel id と provider type を一覧する。                      |
| `recent(limit)`                 | いいえ         | 最近の stored events を読む。                                 |
| `failedDeliveries(limit)`       | いいえ         | 最近の failed deliveries を読む。                             |
| `getDeliveryStatus(deliveryId)` | いいえ         | 1 件の delivery を読む。                                      |

## エラーハンドリング

HTTP 失敗時は `PingBridgeClientError` が throw されます。

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

代表的な `code` は `unauthorized`、`invalid_json`、`invalid_event`、`unknown_target`、`not_found`、`internal_error` です。

## App Settings

アプリやプラグインは PingBridge service settings だけを公開してください。

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
}
```

Provider 設定は PingBridge service 側に属します。アプリ側には置きません。
