# 接入其他项目

PingBridge 是给 App 和插件使用的 Backend Notification as a Service。

App 不应该自己实现 Bark、Telegram 或 ntfy adapter。App 收集用户的通知设置，把 portable config 传给 PingBridge，然后由 PingBridge 统一处理 provider API、格式化、routing、retry、dedupe 和 delivery logs。

## 接入后能实现什么

App 接入后可以：

- 让每个用户选择 Bark、Telegram、ntfy 或多个渠道
- 为通知设置 app name、icon、group label、click URL 和 tags
- 先做 config health check，不发送推送
- 预览单条消息，不发送推送
- 用一个 SDK 方法发送真实通知
- 避免每个插件重复写 provider adapter

App 仍然负责 settings UI 和本地存储。PingBridge 负责 provider delivery。

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
npm install /tmp/pingbridge-client-1.0.0.tgz
```

## App Settings

推荐 settings shape：

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

provider values 只应保存在用户本地 settings 或 secret store。不要提交、打印、写入 event metadata，或发送到不相关的服务。

## 生成 Portable Config

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

如果 `channels` 为空，应先在设置页提示用户启用至少一个渠道。

## 三步接入测试

### 1. Service Health

只检查 PingBridge 服务是否可达，不验证 provider config，也不发送通知。

```ts
const ping = new PingBridgeClient({
  endpoint: settings.endpoint,
  token: settings.appToken
});

await ping.health();
```

### 2. Config Health

检查 portable config shape、group、channel reference，以及当前 PingBridge runtime 是否支持这些 channel type。不发送通知。

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

`previewMessage(...)` 不写 SQLite，不发送 provider notification。

`sendMessage(...)` 是真实通知发送。

## Failure 和 Auth Expired

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

可能 retry 或重复出现的事件应使用 `dedupeKey`。好的 key 通常包含 app id、event type、日期或对象 id。

## 外部 Consumer Smoke Test

```bash
npm run test:external
```

该测试会创建临时外部项目、安装 packed `@pingbridge/client` tarball、启动本地 PingBridge HTTP server，调用 `health`、`checkConfig`、`previewMessage`、`sendMessage`，并验证 preview 不发送而 send 会调用 fake provider。
