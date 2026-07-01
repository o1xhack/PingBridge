# TypeScript SDK

`@pingbridge/client` 是 TypeScript / JavaScript 项目推荐的接入方式。

它通过 HTTP 调用正在运行的 PingBridge 服务，不会直接调用 Bark、ntfy 或 Telegram。

## 安装

npm 发布后：

```bash
npm install @pingbridge/client
```

npm 发布前，可以从本仓库安装 packed tarball：

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @pingbridge/client --pack-destination /tmp
cd /path/to/your/app
npm install /tmp/pingbridge-client-0.1.0.tgz
```

两种方式的 import path 一样：

```ts
import { PingBridgeClient } from "@pingbridge/client";
```

## 创建 Client

```ts
const ping = new PingBridgeClient({
  endpoint: "http://127.0.0.1:8787",
  token: process.env.PINGBRIDGE_TOKEN
});
```

Options：

| Option     | 必填 | 含义                                                             |
| ---------- | ---- | ---------------------------------------------------------------- |
| `endpoint` | 是   | PingBridge service base URL，会自动移除末尾 slash。              |
| `token`    | 否   | 与 `server.appToken` 匹配的 bearer token。服务启用 auth 时必填。 |
| `fetch`    | 否   | 测试或特殊 runtime 使用的自定义 fetch。                          |

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

`source`、`eventType` 和 `dedupeKey` 应使用稳定名称。不要把 access token、password、one-time code 或私人联系方式放进 event payload，因为 events 会写入 SQLite。

## 推荐接入流程

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

`preview(...)` 适合设置页里的“Test connection”按钮：它不会写 SQLite，也不会发送 provider notification。

`notify(...)` 是真实 event submission。

## Methods

| Method                          | 是否发送通知   | 用途                                                    |
| ------------------------------- | -------------- | ------------------------------------------------------- |
| `health()`                      | 否             | 检查服务是否可达。                                      |
| `preview(input)`                | 否             | 检查 payload、auth、target、routing、priority、dedupe。 |
| `notify(input)`                 | 取决于 routing | 提交真实 event。                                        |
| `changed(input)`                | 是             | `notify({ ...input, changed: true })` 的快捷方式。      |
| `failed(input)`                 | 是             | error / failure event 的快捷方式。                      |
| `authExpired(input)`            | 是             | `eventType: "auth.expired"` 的快捷方式。                |
| `test(channelId)`               | 是             | 运维者测试单个 channel，不是普通 App 接入测试。         |
| `listChannels()`                | 否             | 列出 channel id 和 provider type。                      |
| `recent(limit)`                 | 否             | 读取最近 stored events。                                |
| `failedDeliveries(limit)`       | 否             | 读取最近 failed deliveries。                            |
| `getDeliveryStatus(deliveryId)` | 否             | 读取单条 delivery。                                     |

## 错误处理

HTTP 失败会抛出 `PingBridgeClientError`：

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

常见 `code` 包括 `unauthorized`、`invalid_json`、`invalid_event`、`unknown_target`、`not_found` 和 `internal_error`。

## App Settings

App / 插件只应暴露 PingBridge service settings：

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
}
```

Provider 配置属于 PingBridge service，不属于 App。
