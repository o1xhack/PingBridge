# PingBridge 文档

默认文档语言是英文。本目录提供简体中文版本，便于开发者和 Agent 快速接入。

- [English](../README.md)
- [日本語](../ja/README.md)

## 先读这里

| 读者                 | 入口                                                       | 目标                                               |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| App / 插件开发者     | [接入其他项目](integrating-other-projects.md)              | 把 PingBridge 通知接入到另一个项目。               |
| Agent / Codex 自动化 | [Agent 指南](agent-guide.md)                               | 在不泄露 secret、不误发真实通知的前提下修改仓库。  |
| REST API 用户        | [REST API](api.md)                                         | 从任意语言调用 PingBridge。                        |
| TypeScript 用户      | [TypeScript SDK](sdk.md)                                   | 在应用代码里使用 `@pingbridge/client`。            |
| 服务运维者           | [配置](configuration.md) 和 [安全](security.md)            | 运行 PingBridge 并配置 provider。                  |
| 贡献者               | [测试](testing.md)                                         | 在发布前验证改动。                                 |
| Provider 测试者      | [Provider Smoke Setup](provider-smoke-setup.md)            | 在本地配置真实 Bark、ntfy 或 Telegram smoke test。 |
| 产品/架构审阅者      | [架构](architecture.md) 和 [产品研究](product-research.md) | 理解 MVP 边界和参考项目。                          |
| MCP 用户             | [MCP](mcp.md)                                              | 从 Agent 工具环境调用 PingBridge。                 |
| Obsidian 集成        | [Obsidian 接入](obsidian-integration.md)                   | 在 Obsidian 插件或同步项目中接入。                 |

## 核心概念

PingBridge 是 Backend Notification as a Service，不是本地发送工具。

第三方 App 或插件把用户自己的通知渠道配置和 message 传给 PingBridge。PingBridge 负责 provider adaptation、routing、formatting、dedupe、retry、delivery logs 和 provider-specific API。

标准接入测试顺序是：

1. `health()` 检查服务是否可达。
2. `checkConfig(...)` 检查用户渠道配置，但不发送通知。
3. `previewMessage(...)` 检查单条 message，但不发送通知。
4. `sendMessage(...)` 在 routing 允许时发送真实通知。

旧的 `preview(...)` 和 `notify(...)` 仍保留给 YAML static targets、CLI 和 MCP automation。

## 当前 MVP 支持

- Telegram Bot
- Bark
- ntfy
- REST API
- TypeScript client
- CLI
- MCP server
- App/plugin portable user config
- YAML 配置 channels、targets 和 rules
- SQLite event / delivery logs
- 基础 retry 和 dedupe
