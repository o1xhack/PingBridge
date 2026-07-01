# Architecture

PingBridge は REST-first notification gateway です。caller は 1 件の normalized message を送信し、PingBridge が送信可否と delivery channels を決定します。

## API Modes

### Portable User Config

App/plugin integration の推奨 mode です。

1. App は PingBridge endpoint/token と user-selected notification channel settings を保存します。
2. App は `POST /v1/configs/health` で portable config を検証します。通知は送りません。
3. App は `POST /v1/messages/preview` で 1 件の message、group routing、priority、dedupe を検証します。通知は送りません。
4. App は `POST /v1/messages` で実送信します。
5. PingBridge は portable config を request-local in-memory runtime config に変換します。
6. portable config の provider secrets は delivery にだけ使われ、SQLite には保存されません。

### Service-Managed Targets

CLI、MCP automation、trusted backend jobs に向いた mode です。

1. service operator が YAML に `channels`、`targets`、`rules` を設定します。
2. caller は target id を含む `POST /v1/events/preview` または `POST /v1/events` を送ります。
3. PingBridge は service YAML config に対して target を resolve します。

## Runtime Flow

1. server は auth と JSON を検証します。
2. portable request は `config.app`、`config.channels`、`config.groups`、message shape を検証します。
3. standard event request は `source`、`eventType`、`target`、`title`、`message` を検証します。
4. rules を順番に評価します。
5. default behavior は error、`.failed`、`auth.expired`、`changed: true` を送信します。
6. duplicate `dedupeKey` は `deduplicated` として保存され、delivery は行われません。
7. real send request は SQLite に event を書きます。
8. 選択された各 channel で provider delivery attempt を行います。
9. provider failure は server config に従って retry します。
10. delivery result を SQLite に保存します。

Preview と config-health endpoints は SQLite に書かず、provider notification も送りません。

## Packages

```text
server        REST API, config, SQLite, providers, routing, retry
client-js     TypeScript HTTP client
cli           static event client wrapper
mcp-server    MCP stdio server
```

## Data Store

SQLite には次の table があります。

- `events`: real send request 1 件につき 1 row。ignored と deduplicated も含む。
- `deliveries`: channel delivery attempt result 1 件につき 1 row。

YAML provider secrets は server environment から load されます。portable user config secrets は request ごとに渡されます。どちらも provider secrets を SQLite event payload には保存しません。

## 1.0 Non-Goals

- Web UI
- hosted SaaS account system
- multi-tenant user accounts
- Novu / Knock レベルの workflow orchestration
- third-party app 内の provider-specific SDK
- TypeScript 以外の language SDK
