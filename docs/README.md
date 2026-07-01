# Documentation

English is the default documentation language for PingBridge.

Localized documentation is available for:

- [简体中文](zh-CN/README.md)
- [日本語](ja/README.md)

## Start Here

| Reader                 | Start Here                                                                  | Goal                                                                              |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| App/plugin developer   | [Integrating Other Projects](integrating-other-projects.md)                 | Add PingBridge notifications to another project.                                  |
| Agent/Codex automation | [Agent Guide](agent-guide.md)                                               | Make safe repo changes without leaking secrets or sending surprise notifications. |
| REST API user          | [REST API](api.md)                                                          | Call PingBridge from any language.                                                |
| TypeScript user        | [TypeScript SDK](sdk.md)                                                    | Use `@pingbridge/client` from app code.                                           |
| Service operator       | [Configuration](configuration.md) and [Security](security.md)               | Run PingBridge and configure providers.                                           |
| Contributor            | [Testing](testing.md)                                                       | Validate changes before release.                                                  |
| Provider tester        | [Provider Smoke Setup](provider-smoke-setup.md)                             | Configure real Bark, ntfy, or Telegram smoke tests locally.                       |
| Product reviewer       | [Architecture](architecture.md) and [Product Research](product-research.md) | Understand the MVP boundary and design references.                                |

## Core Concept

PingBridge is a backend notification service.

Third-party apps send standard events to PingBridge. PingBridge owns provider secrets, routing, dedupe, retry, delivery logs, and provider-specific APIs.

The normal integration test order is:

1. `health()` checks service reachability.
2. `preview(...)` validates auth, payload, target, routing, priority, and dedupe without sending.
3. `notify(...)` sends a real notification when routing says it should.

## Localization Policy

The English docs are the source of truth and default reading path.

The main docs are also maintained in Simplified Chinese and Japanese:

- overview and agent guide
- REST API and TypeScript SDK
- third-party integration guide
- architecture, configuration, security, testing, MCP, provider smoke, Obsidian integration, and product research notes

Run this check after changing documentation navigation or localized docs:

```bash
npm run docs:check
```
