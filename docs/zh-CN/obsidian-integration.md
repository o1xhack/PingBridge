# Obsidian 接入

Obsidian 插件不应直接集成 Telegram、Bark 或 ntfy。它应该调用 PingBridge。

## 插件设置

推荐设置：

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
}
```

不要在插件 settings 中保存 provider secrets。

## Client

```ts
import { PingBridgeClient } from "@pingbridge/client";

const ping = new PingBridgeClient({
  endpoint: settings.endpoint,
  token: settings.appToken
});
```

## Test Connection

设置页里的测试按钮应先做：

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

`preview` 不发送通知。真实发送测试应是单独、明确的用户动作。

## Events

成功且有变化：

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

失败：

```ts
await ping.failed({
  source: "obsidian-sync-trakt",
  eventType: "sync.failed",
  target: settings.target,
  title: "Trakt sync failed",
  message: "OAuth invalid_grant"
});
```

授权过期：

```ts
await ping.authExpired({
  source: "obsidian-sync-trakt",
  target: settings.target,
  title: "Trakt authorization expired",
  message: "Reconnect Trakt before the next sync."
});
```

## 推荐行为

- `changed: false` 的成功 sync 通常不应打扰用户。
- failure 和 `auth.expired` 应高优先级发送。
- 对可能重复的事件使用 `dedupeKey`。
- 插件 UI 应清楚区分 “Test connection” 和 “Send test notification”。
