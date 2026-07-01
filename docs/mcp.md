# MCP Server

PingBridge includes an MCP stdio server for Codex, Claude Code, and other MCP clients.

The MCP server currently uses the service-managed event flow. It is intended for trusted automation where PingBridge YAML already defines channels and targets. App/plugin integrations should use `@o1x/pingbridge-client` portable config methods instead.

Build the project first:

```bash
npm run build
```

Run the MCP server:

```bash
PINGBRIDGE_ENDPOINT=http://127.0.0.1:8787 \
PINGBRIDGE_TOKEN="$PINGBRIDGE_TOKEN" \
node packages/mcp-server/dist/index.js
```

## Tools

- `send_notification`
- `test_channel`
- `list_channels`
- `list_recent_events`
- `list_failed_deliveries`
- `get_delivery_status`

## Example Tool Input

```json
{
  "source": "codex-automation",
  "eventType": "task.completed",
  "target": "me",
  "title": "Codex automation complete",
  "message": "GitHub commit report has been generated.",
  "changed": true
}
```

## Environment

- `PINGBRIDGE_ENDPOINT`: defaults to `http://127.0.0.1:8787`.
- `PINGBRIDGE_TOKEN`: bearer token for the REST API.
