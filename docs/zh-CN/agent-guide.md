# Agent 指南

这份文档给需要理解或修改 PingBridge 的 coding agent / automation agent 使用。

## 产品契约

PingBridge 是后端通知服务，不是本地发送工具。

第三方 App 发送标准事件给 PingBridge。PingBridge 负责 provider secrets、routing、dedupe、retry、delivery logs 和 provider-specific HTTP APIs。

标准链路：

```text
app/plugin -> @pingbridge/client 或 REST API -> PingBridge service -> Telegram/Bark/ntfy
```

第三方 App 只保存：

```text
endpoint
appToken
target
```

不要保存：

```text
Telegram bot token
Bark device key
ntfy topic/token
PingBridge SQLite data
provider smoke credentials
```

## 文档地图

修改行为或文档前先读对应文件：

| 任务                      | 必读文档                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| 增加新的 App 接入         | `docs/integrating-other-projects.md`、`docs/sdk.md`、`docs/api.md`                             |
| 修改 REST 行为            | `docs/api.md`、`docs/sdk.md`、`docs/testing.md`                                                |
| 修改 SDK 行为             | `docs/sdk.md`、`docs/integrating-other-projects.md`、client tests                              |
| 修改 providers 或 secrets | `docs/configuration.md`、`docs/security.md`、`docs/provider-smoke-setup.md`                    |
| 修改多语言文档            | `docs/README.md`、`docs/zh-CN/README.md`、`docs/ja/README.md`、`scripts/check-doc-locales.mjs` |
| 修改 release gate         | `docs/testing.md`                                                                              |
| 修改架构                  | `docs/architecture.md`                                                                         |

## 安全测试规则

普通改动使用：

```bash
npm run test:all
```

这是默认 quiet gate，不应该发送真实 Bark、ntfy 或 Telegram 通知。

只有明确要验证真实 provider delivery 时才使用：

```bash
npm run test:all:real
```

真实 provider 值保存在本地 `.env`。不要打印、提交或复制到公开文档。

## 接入测试顺序

给另一个项目接入 PingBridge 时，顺序固定为：

1. `health()` 检查服务是否可达。
2. `preview(...)` 检查 payload、auth、target、routing、priority 和 dedupe，不发送通知。
3. `notify(...)` 发送真实通知。

不要把 `notify(...)` 当作第一个连接测试。它会制造真实推送噪音，也会让失败排查更混乱。

## Agent Checklist

改代码前：

- 确认变更影响 server API、SDK API、CLI、MCP、docs 还是 provider behavior。
- 更新所有受影响的文档。新增 SDK method 通常会影响 `docs/sdk.md`、`docs/api.md`、`docs/integrating-other-projects.md` 和测试。
- 示例必须可复制，并且只使用 placeholder secrets。
- 保持 `preview` 文档语义：不发送通知。
- 英文是默认文档路径；核心接入文档变化时要同步 `docs/zh-CN` 和 `docs/ja`。
- 保持默认测试 quiet。

提交前：

```bash
npm run format:write
npm run docs:check
npm run test:all
git status --short
```

发布 package 前：

```bash
npm run test:package
npm run test:external
npm whoami
```

如果 `npm whoami` 返回 `ENEEDAUTH`，说明 npm 发布被认证阻塞。
