# アーキテクチャ

PingBridge は REST-first notification gateway です。呼び出し側は標準イベントを 1 回送信し、PingBridge が送信可否と送信先を決めます。

## Runtime Flow

1. Client が bearer token 付きで `POST /v1/events` を呼び出す。
2. Server が event payload を検証する。
3. Rules を順番に評価する。
4. rule が一致しない場合、既定 MVP behavior を使う。
   - `severity: error` は送信される。
   - `.failed` で終わる event type は送信される。
   - `auth.expired` は送信される。
   - `changed: true` は送信される。
   - 通常の `changed: false` events は記録されるが送信されない。
5. `dedupeKey` があり、設定 window 内で既に受け入れ済みなら、event は `deduplicated` として保存され、delivery は試行されない。
6. event を SQLite に書き込む。
7. 各 target channel に provider delivery attempt を実行する。
8. 失敗した provider call は server config に従って retry される。
9. delivery result を SQLite に書き込む。

## Packages

```text
server
  config.ts      YAML loading, env expansion, config validation
  database.ts    SQLite schema and event/delivery persistence
  providers.ts   Telegram, Bark, and ntfy HTTP providers
  service.ts     routing, dedupe, retry, delivery orchestration
  http.ts        REST API server

client-js
  index.ts       TypeScript HTTP client

cli
  index.ts       command-line wrapper around client-js

mcp-server
  index.ts       MCP stdio server
  tools.ts       testable MCP tool handlers
```

## Data Store

SQLite には 2 つの table があります。

- `events`: accepted request ごとに 1 行。ignored と deduplicated events も含む。
- `deliveries`: channel delivery attempt result ごとに 1 行。

Provider secrets は SQLite に保存されません。YAML config と environment expansion から取得されます。

## 1.0 Non-Goals

- Web UI
- hosted SaaS
- multi-user accounts
- workflow orchestration
- サードパーティアプリ内の provider-specific SDK
- TypeScript 以外の language-specific SDK
