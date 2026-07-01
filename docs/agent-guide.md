# Agent Guide

This guide is for coding agents and automation agents that need to understand or modify PingBridge safely.

## Product Contract

PingBridge is a Backend Notification as a Service. It is not a local-only sender.

Third-party apps pass portable user notification config and messages to PingBridge. PingBridge owns provider adaptation, routing, dedupe, retries, delivery logs, and provider-specific HTTP APIs.

The standard integration flow is:

```text
app/plugin settings -> portable config -> @pingbridge/client or REST API -> PingBridge service -> Telegram/Bark/ntfy
```

Third-party apps should store only:

```text
endpoint
appToken
user-selected Bark/Telegram/ntfy config
app name/icon/group defaults
```

They should not implement or duplicate:

```text
Telegram HTTP adapter
Bark HTTP adapter
ntfy HTTP adapter
PingBridge SQLite data
provider smoke credentials
```

Portable provider config is allowed in app settings when it belongs to the end user. It must not be committed, logged, or placed in event metadata.

## Documentation Map

Read these files before making behavior or documentation changes:

| Task                        | Required Docs                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Add another app integration | `docs/integrating-other-projects.md`, `docs/sdk.md`, `docs/api.md`                             |
| Change REST behavior        | `docs/api.md`, `docs/sdk.md`, `docs/testing.md`                                                |
| Change SDK behavior         | `docs/sdk.md`, `docs/integrating-other-projects.md`, client tests                              |
| Change providers or secrets | `docs/configuration.md`, `docs/security.md`, `docs/provider-smoke-setup.md`                    |
| Change localized docs       | `docs/README.md`, `docs/zh-CN/README.md`, `docs/ja/README.md`, `scripts/check-doc-locales.mjs` |
| Change release gate         | `docs/testing.md`                                                                              |
| Change architecture         | `docs/architecture.md`                                                                         |

## Safe Test Rules

Use this gate for normal changes:

```bash
npm run test:all
```

This is the default quiet gate. It must not send real Bark, ntfy, or Telegram notifications.

Use this only when explicitly checking real provider delivery:

```bash
npm run test:all:real
```

Real provider values live in local `.env`. Do not print them in logs, commit them, or copy them into public docs.

## Integration Test Order

When adding PingBridge to another project, use this order:

1. `health()` checks service reachability.
2. `checkConfig(...)` checks portable user channel config without sending.
3. `previewMessage(...)` checks one message without sending.
4. `sendMessage(...)` sends a real notification.

Do not use `sendMessage(...)` as the first connection test. That creates noisy real pushes and makes failure diagnosis worse.

## Agent Checklist

Before changing code:

- Confirm whether the change affects server API, SDK API, CLI, MCP, docs, or provider behavior.
- Update every affected doc. For example, a new SDK method usually affects `docs/sdk.md`, `docs/api.md`, `docs/integrating-other-projects.md`, and tests.
- Keep examples copy-pasteable with placeholder secrets only.
- Keep `checkConfig` and `previewMessage` documented as non-sending.
- Keep English as the default docs path and update `docs/zh-CN` and `docs/ja` when core integration docs change.
- Keep default tests quiet.

Before committing:

```bash
npm run format:write
npm run docs:check
npm run test:all
git status --short
```

Before publishing packages:

```bash
npm run test:package
npm run test:external
npm whoami
```

If `npm whoami` fails with `ENEEDAUTH`, package publishing is blocked until npm authentication is configured.
