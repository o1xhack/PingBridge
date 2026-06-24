# PingBridge

PingBridge is a self-hosted notification gateway. Apps send standard events to PingBridge; PingBridge handles routing, formatting, dedupe, retry, delivery logs, and provider-specific push APIs.

The 1.0 MVP supports:

- Telegram Bot
- Bark
- ntfy
- REST API
- TypeScript client
- CLI
- MCP server
- YAML configuration for channels, targets, and rules
- SQLite event and delivery logs
- Basic retry and dedupe

PingBridge is not a full BaaS, hosted notification cloud, workflow engine, Web UI, or multi-user product.

## Quick Start

```bash
npm install
cp .env.example .env
cp pingbridge.config.example.yaml pingbridge.config.yaml
```

Edit `.env` and `pingbridge.config.yaml`, then run:

```bash
export PINGBRIDGE_TOKEN="change-me"
export NTFY_TOPIC="your-private-topic"
npm run dev:server
```

Send an event:

```bash
curl -X POST http://127.0.0.1:8787/v1/events \
  -H "Authorization: Bearer $PINGBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "obsidian-sync-trakt",
    "eventType": "sync.completed",
    "target": "me",
    "title": "Trakt sync completed",
    "message": "Wrote 3 Daily Notes.",
    "changed": true,
    "dedupeKey": "obsidian-sync-trakt:daily-notes"
  }'
```

Use the CLI:

```bash
npm run build
PINGBRIDGE_ENDPOINT=http://127.0.0.1:8787 \
PINGBRIDGE_TOKEN="$PINGBRIDGE_TOKEN" \
node packages/cli/dist/index.js notify \
  --source github-commit-report \
  --event sync.completed \
  --target me \
  --title "GitHub report complete" \
  --message "2 projects changed, 14 commits found." \
  --changed true
```

## Configuration Model

PingBridge has three main concepts:

- `channels`: provider-specific destinations such as a Telegram chat, Bark device, or ntfy topic.
- `targets`: stable recipient groups that third-party apps can reference.
- `rules`: routing policy for event types and changed/error behavior.

Example:

```yaml
channels:
  ntfy_personal:
    type: ntfy
    server: https://ntfy.sh
    topic: ${NTFY_TOPIC}

targets:
  me:
    channels:
      - ntfy_personal

rules:
  - match:
      eventType: sync.failed
    target: me
    priority: high

  - match:
      eventType: auth.expired
    target: me
    priority: high

  - match:
      eventType: sync.completed
      changed: true
    target: me
    priority: normal
```

See [configuration.md](docs/configuration.md) for the full format.

## Packages

```text
packages/server      REST API, config, SQLite store, rules, providers
packages/client-js   TypeScript client for apps and Obsidian plugins
packages/cli         Shell/Codex automation CLI
packages/mcp-server  MCP tools for Codex/Claude-style automation
```

## Scripts

```bash
npm run dev:server
npm run build
npm run typecheck
npm test
```

## Docs

- [Architecture](docs/architecture.md)
- [REST API](docs/api.md)
- [Configuration](docs/configuration.md)
- [Obsidian Integration](docs/obsidian-integration.md)
- [MCP](docs/mcp.md)
- [Security](docs/security.md)
- [Testing](docs/testing.md)
