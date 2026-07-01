# MCP

`@pingbridge/mcp-server` 暴露 MCP stdio server，让 Codex / Claude-style agents 可以通过 PingBridge 发送通知。

## 启动

```bash
npm run build
PINGBRIDGE_ENDPOINT=http://127.0.0.1:8787 \
PINGBRIDGE_TOKEN="$PINGBRIDGE_TOKEN" \
node packages/mcp-server/dist/index.js
```

发布后可使用 package bin：

```bash
pingbridge-mcp
```

## Tools

### `pingbridge_notify`

发送标准 PingBridge event。

Input:

```json
{
  "source": "codex",
  "eventType": "task.completed",
  "target": "me",
  "title": "Codex task completed",
  "message": "The build passed.",
  "changed": true,
  "dedupeKey": "codex:task:123"
}
```

### `pingbridge_failed`

发送 failure event，使用 `severity: error` 和 `changed: true`。

### `pingbridge_auth_expired`

发送 `auth.expired` event。

## Agent Guidance

Agent 应用 `preview` / dry-run style tests 验证配置，再发送真实 notification。不要把 provider secrets 放进 MCP config；MCP 只需要 PingBridge endpoint 和 app token。
