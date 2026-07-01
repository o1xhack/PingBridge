# 架构

PingBridge 是 REST-first notification gateway。调用方提交一条 normalized message，PingBridge 决定是否发送以及发到哪些渠道。

## API 模式

### Portable User Config

这是 App/plugin 推荐模式：

1. App 保存 PingBridge endpoint/token 和用户选择的通知渠道设置。
2. App 调用 `POST /v1/configs/health` 校验 portable config，不发送通知。
3. App 调用 `POST /v1/messages/preview` 校验单条 message、group routing、priority、dedupe，不发送通知。
4. App 调用 `POST /v1/messages` 真实发送。
5. PingBridge 把 portable config 临时转换成 in-memory runtime config。
6. portable config 中的 provider secrets 只用于当前 delivery，不写入 SQLite。

### Service-Managed Targets

这个模式适合 CLI、MCP automation 和可信 backend job：

1. service operator 在 YAML 中配置 `channels`、`targets`、`rules`。
2. 调用方发送 `POST /v1/events/preview` 或 `POST /v1/events`，payload 里包含 target id。
3. PingBridge 用 YAML config 解析 target。

## Runtime Flow

1. server 校验 auth 和 JSON。
2. portable request 校验 `config.app`、`config.channels`、`config.groups` 和 message shape。
3. standard event request 校验 `source`、`eventType`、`target`、`title`、`message`。
4. rules 按顺序评估。
5. 默认会发送 error、`.failed`、`auth.expired`、`changed: true`。
6. 有重复 `dedupeKey` 时，event 写为 `deduplicated`，不 delivery。
7. 真实 send request 写入 SQLite。
8. 每个选中 channel 执行 provider delivery attempt。
9. provider failure 按 server config retry。
10. delivery result 写入 SQLite。

Preview 和 config-health endpoint 不写 SQLite，也不发送 provider notification。

## Packages

```text
server        REST API、config、SQLite、providers、routing、retry
client-js     TypeScript HTTP client
cli           static event client wrapper
mcp-server    MCP stdio server
```

## Data Store

SQLite 包含：

- `events`: 每个真实 send request 一行，包括 ignored 和 deduplicated。
- `deliveries`: 每个 channel delivery attempt result 一行。

YAML provider secrets 从服务端环境加载。portable user config secrets 由每个请求提供。两种路径都不会把 provider secrets 写入 SQLite event payload。

## 1.0 Non-Goals

- Web UI
- hosted SaaS account system
- multi-tenant user accounts
- Novu / Knock 级别 workflow orchestration
- 第三方 App 内的 provider-specific SDK
- TypeScript 之外的语言 SDK
