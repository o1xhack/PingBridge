# 他プロジェクトへの組み込み

PingBridge はバックエンド通知サービスです。サードパーティアプリは Bark、ntfy、Telegram を直接組み込まず、PingBridge に標準イベントを送るべきです。

## アプリが得られるもの

組み込み後、アプリは次を実行できます。

- PingBridge が到達可能か確認する
- 通知を送らずに routing を preview する
- success、changed、failure、auth-expired 通知を送る
- サーバー側 provider routing を利用する
- アプリ内に provider secrets を保存しない

アプリは hosted cloud account、user management、provider-specific SDK を得るわけではありません。

## 現在の MVP インストール方法

client package は publish 可能ですが、まだ npm には publish されていません。

publish 後：

```bash
npm install @pingbridge/client
```

publish 前は、この repository から local tarball を使います。

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @pingbridge/client --pack-destination /tmp
```

別プロジェクト側：

```bash
npm install /tmp/pingbridge-client-0.1.0.tgz
```

import path は同じです。

```ts
import { PingBridgeClient } from "@pingbridge/client";
```

## App 設定

アプリやプラグインは PingBridge service settings だけを保存します。

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
}
```

Bark device key、ntfy topic、Telegram bot token は保存しないでください。

推奨設定：

| Setting   | 説明                                                  |
| --------- | ----------------------------------------------------- |
| Enabled   | PingBridge 通知を有効化するか。                       |
| Endpoint  | PingBridge service URL。例：`http://127.0.0.1:8787`。 |
| App token | PingBridge service operator が作成した bearer token。 |
| Target    | 安定した受信グループ。例：`me`、`ops`。               |

## 3 ステップ連携テスト

サードパーティプロジェクトではこの順序を使います。

### 1. Health Check

サービス到達性を確認します。通知は送りません。

```ts
const ping = new PingBridgeClient({
  endpoint: settings.endpoint,
  token: settings.appToken
});

await ping.health();
```

CLI：

```bash
pingbridge health --endpoint "$PINGBRIDGE_ENDPOINT" --token "$PINGBRIDGE_TOKEN"
```

失敗した場合は endpoint、service 起動状態、network boundary を確認してください。

### 2. Preview

payload shape、token、target、routing、priority、dedupe state を確認します。通知は送りません。

```ts
const preview = await ping.preview({
  source: "obsidian-sync-trakt",
  eventType: "sync.completed",
  target: settings.target,
  title: "Trakt sync completed",
  message: "Wrote 3 Daily Notes.",
  changed: true,
  dedupeKey: "obsidian-sync-trakt:daily-notes"
});

console.log(preview.channels);
```

失敗した場合は、実通知を試す前に token、target、payload shape、service config を直してください。

`preview.notify` が `false` の場合、event は有効ですが現在の routing では送信されません。多くの unchanged success events ではこれが期待値です。

### 3. Notify

routing が許可する場合に実通知を送ります。

```ts
await ping.notify({
  source: "obsidian-sync-trakt",
  eventType: "sync.completed",
  target: settings.target,
  title: "Trakt sync completed",
  message: "Wrote 3 Daily Notes.",
  changed: true,
  dedupeKey: "obsidian-sync-trakt:daily-notes"
});
```

`health` と `preview` が通ってから使ってください。

## Failure と Auth Expired

```ts
await ping.failed({
  source: "obsidian-sync-trakt",
  eventType: "sync.failed",
  target: settings.target,
  title: "Trakt sync failed",
  message: "OAuth invalid_grant"
});

await ping.authExpired({
  source: "obsidian-sync-trakt",
  target: settings.target,
  title: "Trakt authorization expired",
  message: "Reconnect Trakt before the next sync."
});
```

## 最小 Helper

```ts
import { PingBridgeClient, PingBridgeClientError, type NotifyInput } from "@pingbridge/client";

export async function sendPingBridgeEvent(
  settings: PingBridgeSettings,
  event: Omit<NotifyInput, "target">
): Promise<void> {
  if (!settings.enabled) return;

  const ping = new PingBridgeClient({
    endpoint: settings.endpoint,
    token: settings.appToken
  });

  try {
    await ping.notify({ ...event, target: settings.target });
  } catch (error) {
    if (error instanceof PingBridgeClientError) {
      console.warn(`PingBridge failed: ${error.status} ${error.code}: ${error.message}`);
      return;
    }
    throw error;
  }
}
```

設定画面の "Test connection" には `ping.health()` と `ping.preview(...)` を使ってください。最初のテストに `notify(...)` を使うと実 push が送られます。

## Event 命名

安定した dotted event names を推奨します。

| シナリオ              | 例                                  |
| --------------------- | ----------------------------------- |
| sync 成功かつ変更あり | `sync.completed` + `changed: true`  |
| sync 成功かつ変更なし | `sync.completed` + `changed: false` |
| sync 失敗             | `sync.failed`                       |
| OAuth token 期限切れ  | `auth.expired`                      |
| background job 完了   | `job.completed`                     |
| background job 失敗   | `job.failed`                        |

retry または重複の可能性がある event には `dedupeKey` を使ってください。よい key には通常 source、event type、日付または object id を含めます。

## External Consumer Smoke Test

PingBridge には quiet external consumer test があります。

```bash
npm run test:external
```

これは一時的な外部プロジェクトを作成し、packed `@pingbridge/client` tarball をインストールし、ローカル PingBridge HTTP server を起動して `health`、`preview`、`notify` を呼びます。fake provider を使うため Bark/ntfy/Telegram は送信されません。
