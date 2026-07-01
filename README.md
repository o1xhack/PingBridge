# PingBridge

PingBridge is a self-hosted notification gateway. Apps pass one normalized message and user-owned channel config to PingBridge; PingBridge handles routing, formatting, dedupe, retry, delivery logs, and provider-specific push APIs.

PingBridge is intended to run as a Backend Notification as a Service. Third-party apps install the SDK or call the REST API; they do not implement Bark, ntfy, or Telegram provider adapters.

## Languages

English is the default documentation language.

- [English docs](docs/README.md)
- [简体中文文档](docs/zh-CN/README.md)
- [日本語ドキュメント](docs/ja/README.md)

## Read This First

| Reader                 | Start Here                                                              | Goal                                                                              |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| App/plugin developer   | [Integrating Other Projects](docs/integrating-other-projects.md)        | Add PingBridge notifications to another project.                                  |
| Agent/Codex automation | [Agent Guide](docs/agent-guide.md)                                      | Make safe repo changes without leaking secrets or sending surprise notifications. |
| API user               | [REST API](docs/api.md)                                                 | Call PingBridge from any language.                                                |
| TypeScript user        | [TypeScript SDK](docs/sdk.md)                                           | Use `@o1x/pingbridge-client` from app code.                                       |
| Service operator       | [Configuration](docs/configuration.md) and [Security](docs/security.md) | Run PingBridge and configure providers.                                           |
| Contributor            | [Testing](docs/testing.md)                                              | Validate changes before release.                                                  |

The 1.0 MVP supports:

- Telegram Bot
- Bark
- ntfy
- REST API
- TypeScript client
- CLI
- MCP server
- portable user config for app/plugin integrations
- YAML configuration for channels, targets, and rules
- SQLite event and delivery logs
- Basic retry and dedupe

PingBridge is not a full BaaS, hosted notification cloud, workflow engine, Web UI, or multi-user product.

## Core Flow

1. An app or plugin stores PingBridge endpoint/token plus the user's selected Bark, Telegram, or ntfy settings.
2. The app sends that portable config to PingBridge.
3. The app calls `health()` to check service connectivity.
4. The app calls `checkConfig(...)` to validate user channel config without sending.
5. The app calls `previewMessage(...)` to verify routing, priority, and dedupe without sending.
6. The app calls `sendMessage(...)` when it wants PingBridge to deliver a real notification.

For CLIs, MCP automation, and trusted backend jobs, PingBridge also supports service-managed YAML `channels` and `targets` through `preview(...)` and `notify(...)`.

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

## Third-Party App Integration

The SDK package is ready for npm publishing, but has not been published yet. Until it is published, another local project can install a packed tarball:

```bash
npm run build
npm pack --workspace @o1x/pingbridge-client --pack-destination /tmp
```

Then in the app/plugin project:

```bash
npm install /tmp/o1x-pingbridge-client-1.0.0.tgz
```

Use it from app code:

```ts
import { PingBridgeClient } from "@o1x/pingbridge-client";

const ping = new PingBridgeClient({
  endpoint: "http://127.0.0.1:8787",
  token: process.env.PINGBRIDGE_TOKEN
});

await ping.health();

const config = {
  app: {
    id: "my-plugin",
    name: "My Plugin",
    defaultGroup: "personal"
  },
  channels: {
    phone: {
      type: "bark" as const,
      endpoint: "https://api.day.app",
      deviceKey: userSettings.barkDeviceKey
    }
  },
  groups: {
    personal: {
      label: "My Plugin",
      channels: ["phone"]
    }
  },
  defaults: {
    group: "personal",
    changed: true
  }
};

await ping.checkConfig(config);

const input = {
  config,
  message: {
    eventType: "task.completed",
    title: "Task completed",
    message: "This sends through PingBridge, not app-side Bark code.",
    dedupeKey: "my-plugin:task.completed"
  }
};

await ping.previewMessage(input);
await ping.sendMessage(input);
```

See [Integrating Other Projects](docs/integrating-other-projects.md).

## Configuration Model

For service-managed YAML mode, PingBridge has three main concepts:

- `channels`: provider-specific destinations such as a Telegram chat, Bark device, or ntfy topic.
- `targets`: stable recipient groups that CLIs, MCP tools, or trusted backend jobs can reference.
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
npm run lint
npm run docs:check
npm run test:all
npm run test:external
npm run test:all:real
npm test
```

`npm run test:all` is the normal quiet gate and does not send Bark, ntfy, or Telegram notifications. `npm run test:all:real` includes real provider smoke tests when local `.env` credentials are present.

## Docs

- [Documentation Index](docs/README.md)
- [Agent Guide](docs/agent-guide.md)
- [Architecture](docs/architecture.md)
- [REST API](docs/api.md)
- [TypeScript SDK](docs/sdk.md)
- [Configuration](docs/configuration.md)
- [Obsidian Integration](docs/obsidian-integration.md)
- [MCP](docs/mcp.md)
- [Security](docs/security.md)
- [Testing](docs/testing.md)
- [Provider Smoke Setup](docs/provider-smoke-setup.md)
- [Integrating Other Projects](docs/integrating-other-projects.md)
- [Product Research Notes](docs/product-research.md)
