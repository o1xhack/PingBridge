# 架构

PingBridge 是 REST-first notification gateway。调用方只发送一次标准事件，PingBridge 决定是否发送以及发送到哪里。

## Runtime Flow

1. Client 使用 bearer token 调用 `POST /v1/events`。
2. Server 校验 event payload。
3. 按顺序评估 rules。
4. 如果没有 rule 命中，使用默认 MVP 行为：
   - `severity: error` 会发送。
   - 以 `.failed` 结尾的 event type 会发送。
   - `auth.expired` 会发送。
   - `changed: true` 会发送。
   - 普通 `changed: false` event 会记录但不发送。
5. 如果存在 `dedupeKey` 且在配置窗口内已被接受，event 会存为 `deduplicated`，不尝试 delivery。
6. event 写入 SQLite。
7. 每个 target channel 执行 provider delivery attempt。
8. 失败 provider call 按 server config retry。
9. delivery result 写入 SQLite。

## Packages

```text
server
  config.ts      YAML loading, env expansion, config validation
  database.ts    SQLite schema and event/delivery persistence
  providers.ts   Telegram, Bark, and ntfy HTTP providers
  service.ts     routing, dedupe, retry, delivery orchestration
  http.ts        REST API server

client-js
  index.ts       TypeScript HTTP client

cli
  index.ts       command-line wrapper around client-js

mcp-server
  index.ts       MCP stdio server
  tools.ts       testable MCP tool handlers
```

## Data Store

SQLite 包含两张表：

- `events`: 每个 accepted request 一行，包括 ignored 和 deduplicated events。
- `deliveries`: 每个 channel delivery attempt result 一行。

Provider secrets 不会写入 SQLite。它们来自 YAML 配置和环境变量展开。

## 1.0 Non-Goals

- Web UI
- hosted SaaS
- multi-user accounts
- workflow orchestration
- 在第三方 App 中加入 provider-specific SDK
- TypeScript 之外的语言 SDK
