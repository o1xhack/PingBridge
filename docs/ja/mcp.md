# MCP

`@o1x/pingbridge-mcp-server` は MCP stdio server を公開し、Codex / Claude-style agents が PingBridge 経由で通知を送れるようにします。

MCP server は現在 service-managed event flow を使います。PingBridge YAML に channels/targets が定義済みの trusted automation 向けです。App/plugin integration では `@o1x/pingbridge-client` の portable config methods を使ってください。

## 起動

```bash
npm run build
PINGBRIDGE_ENDPOINT=http://127.0.0.1:8787 \
PINGBRIDGE_TOKEN="$PINGBRIDGE_TOKEN" \
node packages/mcp-server/dist/index.js
```

publish 後は package bin を使えます。

```bash
pingbridge-mcp
```

## Tools

### `pingbridge_notify`

標準 PingBridge event を送信します。

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

`severity: error` と `changed: true` の failure event を送ります。

### `pingbridge_auth_expired`

`auth.expired` event を送ります。

## Agent Guidance

Agent は実 notification を送る前に service-managed preview / dry-run style tests で YAML target を検証してください。provider secrets を MCP config に入れないでください。MCP が必要とするのは PingBridge endpoint と app token だけです。
