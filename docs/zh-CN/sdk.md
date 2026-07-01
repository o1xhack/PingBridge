# TypeScript SDK

`@o1x/pingbridge-client` 是 TypeScript / JavaScript App 的推荐接入方式。

SDK 只通过 HTTP 调用 PingBridge 服务，不会直接调用 Bark、ntfy 或 Telegram。第三方 App 的主要职责是保存用户选择的渠道配置，并把这份 portable config 传给 PingBridge。

## 安装

npm 发布后：

```bash
npm install @o1x/pingbridge-client
```

npm 发布前，可以从本仓库安装 packed tarball：

```bash
cd /path/to/PingBridge
npm run build
npm pack --workspace @o1x/pingbridge-client --pack-destination /tmp
cd /path/to/your/app
npm install /tmp/o1x-pingbridge-client-1.0.0.tgz
```

## 创建 Client

```ts
import { PingBridgeClient } from "@o1x/pingbridge-client";

const ping = new PingBridgeClient({
  endpoint: "http://127.0.0.1:8787",
  token: process.env.PINGBRIDGE_TOKEN
});
```

## Portable User Config

这是 App/plugin 集成的推荐契约。

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

不要把 provider token 放进 `message`、`items`、`metadata`、title 或日志。PingBridge 会使用 portable config 发送，但不会把 Bark device key、Telegram bot token、ntfy token/topic 写入 SQLite event payload。

## 推荐接入流程

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

`checkConfig(...)` 校验用户渠道配置，不发送通知。

`previewMessage(...)` 校验配置和单条消息，不发送通知、不写 SQLite。

`sendMessage(...)` 是真实发送。

## Methods

| Method                          | 是否发送通知   | 用途                                                        |
| ------------------------------- | -------------- | ----------------------------------------------------------- |
| `health()`                      | 否             | 检查服务是否可达。                                          |
| `checkConfig(config)`           | 否             | 校验 portable user provider config 和 provider support。    |
| `previewMessage(input)`         | 否             | 校验 portable config + message，不发送。                    |
| `sendMessage(input)`            | 取决于 routing | 用用户渠道配置发送真实消息。                                |
| `preview(input)`                | 否             | legacy/static target：校验 payload、auth、target、routing。 |
| `notify(input)`                 | 取决于 routing | legacy/static target：提交真实 event。                      |
| `changed(input)`                | 是             | `notify({ ...input, changed: true })` 的快捷方式。          |
| `failed(input)`                 | 是             | error / failure event 的快捷方式。                          |
| `authExpired(input)`            | 是             | `eventType: "auth.expired"` 的快捷方式。                    |
| `test(channelId)`               | 是             | 运维者测试单个 YAML channel，不是普通 App 接入测试。        |
| `listChannels()`                | 否             | 列出 YAML channel id 和 provider type。                     |
| `recent(limit)`                 | 否             | 读取最近 stored events。                                    |
| `failedDeliveries(limit)`       | 否             | 读取最近 failed deliveries。                                |
| `getDeliveryStatus(deliveryId)` | 否             | 读取单条 delivery。                                         |

## 错误处理

HTTP 失败会抛出 `PingBridgeClientError`：

```ts
import { PingBridgeClientError } from "@o1x/pingbridge-client";

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

常见 `code` 包括 `unauthorized`、`invalid_json`、`invalid_event`、`invalid_config`、`invalid_portable_message`、`unknown_group`、`unknown_target`、`not_found` 和 `internal_error`。

## App Settings

App / 插件应暴露 PingBridge 服务设置和用户自己的通知渠道设置，但不要实现 provider HTTP 调用：

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

这些值只应保存在用户本地设置或 secret store 中，不要提交到仓库、打印到日志或写入 event metadata。
