# Obsidian 連携

Obsidian plugin は Telegram、Bark、ntfy を直接組み込むべきではありません。PingBridge を呼び出してください。

## Plugin Settings

推奨設定：

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
}
```

plugin settings に provider secrets を保存しないでください。

## Client

```ts
import { PingBridgeClient } from "@pingbridge/client";

const ping = new PingBridgeClient({
  endpoint: settings.endpoint,
  token: settings.appToken
});
```

## Test Connection

設定画面のテストボタンでは、まず次を実行します。

```ts
await ping.health();

await ping.preview({
  source: "obsidian-plugin",
  eventType: "sync.completed",
  target: settings.target,
  title: "Preview only",
  message: "This validates routing without sending.",
  changed: true
});
```

`preview` は通知を送りません。実送信テストは別の明示的なユーザー操作にしてください。

## Events

成功かつ変更あり：

```ts
await ping.changed({
  source: "obsidian-sync-trakt",
  eventType: "sync.completed",
  target: settings.target,
  title: "Trakt sync completed",
  message: "Wrote 3 Daily Notes.",
  dedupeKey: "obsidian-sync-trakt:2026-06-24"
});
```

失敗：

```ts
await ping.failed({
  source: "obsidian-sync-trakt",
  eventType: "sync.failed",
  target: settings.target,
  title: "Trakt sync failed",
  message: "OAuth invalid_grant"
});
```

認証期限切れ：

```ts
await ping.authExpired({
  source: "obsidian-sync-trakt",
  target: settings.target,
  title: "Trakt authorization expired",
  message: "Reconnect Trakt before the next sync."
});
```

## 推奨挙動

- `changed: false` の成功 sync は通常ユーザーを邪魔しない。
- failure と `auth.expired` は high priority で送る。
- 重複し得る event には `dedupeKey` を使う。
- plugin UI では "Test connection" と "Send test notification" を明確に分ける。
