# 接入其他项目

PingBridge 是后端通知服务。第三方 App 不应该直接集成 Bark、ntfy 或 Telegram，而应该向 PingBridge 发送标准事件。

## 接入后能实现什么

App 接入后可以：

- 检查 PingBridge 是否可达
- 预览 routing 且不发送通知
- 发送成功、changed、failure、auth-expired 通知
- 复用服务端 provider routing
- 避免在 App 里保存 provider secrets

App 不会获得 hosted cloud account、user management 或 provider-specific SDK。

## 当前 MVP 安装路径

client package 已经可以发布，但还没有发布到 npm。

发布后：

```bash
npm install @pingbridge/client
```

发布前，从本仓库安装本地 tarball：

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @pingbridge/client --pack-destination /tmp
```

然后在另一个项目里：

```bash
npm install /tmp/pingbridge-client-0.1.0.tgz
```

import path 保持一致：

```ts
import { PingBridgeClient } from "@pingbridge/client";
```

## App 配置

App 或插件只保存 PingBridge service settings：

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
}
```

不要保存 Bark device key、ntfy topic、Telegram bot token。

推荐设置项：

| Setting   | 说明                                                   |
| --------- | ------------------------------------------------------ |
| Enabled   | 是否启用 PingBridge 通知。                             |
| Endpoint  | PingBridge service URL，例如 `http://127.0.0.1:8787`。 |
| App token | PingBridge 服务运维者创建的 bearer token。             |
| Target    | 稳定收件人组，例如 `me` 或 `ops`。                     |

## 三步接入测试

第三方项目按这个顺序测试。

### 1. Health Check

检查服务是否可达，不发送通知。

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

如果失败，优先检查 endpoint、服务是否运行、网络边界。

### 2. Preview

检查 payload shape、token、target、routing、priority 和 dedupe state，不发送通知。

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

如果失败，先修 token、target、payload shape 或 service config。不要直接进入真实通知测试。

如果 `preview.notify` 是 `false`，说明事件合法，但当前 routing 不会发送。很多 unchanged success events 都应该是这样。

### 3. Notify

在 routing 允许时发送真实通知。

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

只有在 `health` 和 `preview` 都通过后再调用。

## Failure 和 Auth Expired

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

设置页的 “Test connection” 应使用 `ping.health()` 和 `ping.preview(...)`。不要用 `notify(...)` 做第一次测试，因为它会发送真实推送。

## Event 命名

推荐稳定的 dotted event names：

| 场景                | 示例                                |
| ------------------- | ----------------------------------- |
| sync 成功且有变化   | `sync.completed` + `changed: true`  |
| sync 成功且无变化   | `sync.completed` + `changed: false` |
| sync 失败           | `sync.failed`                       |
| OAuth token 过期    | `auth.expired`                      |
| background job 完成 | `job.completed`                     |
| background job 失败 | `job.failed`                        |

可能 retry 或重复出现的事件应使用 `dedupeKey`。好的 key 通常包含 source、event type、日期或对象 id。

## 外部 Consumer Smoke Test

PingBridge 包含 quiet external consumer test：

```bash
npm run test:external
```

它会创建临时外部项目、安装 packed `@pingbridge/client` tarball、启动本地 PingBridge HTTP server，并调用 `health`、`preview`、`notify`。该测试使用 fake provider，不会发送 Bark/ntfy/Telegram。
