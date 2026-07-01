# REST API

PingBridge はアプリ、プラグイン、CLI、Agent 向けに小さな REST API を提供します。

TypeScript ではないプロジェクト、または `@pingbridge/client` を使えないプロジェクトは REST API を直接呼び出してください。

## Endpoint Index

| Method | Path                             | 通知送信       | 用途                                                          |
| ------ | -------------------------------- | -------------- | ------------------------------------------------------------- |
| `GET`  | `/v1/health`                     | いいえ         | サービス到達性を確認する。                                    |
| `POST` | `/v1/events/preview`             | いいえ         | payload、auth、target、routing、priority、dedupe を確認する。 |
| `POST` | `/v1/events`                     | routing に従う | 実イベントを送信する。                                        |
| `GET`  | `/v1/channels`                   | いいえ         | 設定済み channel id と type を一覧する。                      |
| `POST` | `/v1/channels/:id/test`          | はい           | 1 つの provider channel にテストメッセージを送る。            |
| `GET`  | `/v1/events/recent?limit=20`     | いいえ         | 最近保存された events を見る。                                |
| `GET`  | `/v1/deliveries/failed?limit=20` | いいえ         | 最近失敗した provider deliveries を見る。                     |
| `GET`  | `/v1/deliveries/:id`             | いいえ         | 1 件の delivery result を見る。                               |

## Auth

`server.appToken` が設定されている場合、`/v1/health` 以外の endpoint には bearer token が必要です。

```http
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

`server.appToken` が空の場合、保護 endpoint は認証なしになります。これは隔離されたローカル実験だけで使ってください。

## 標準 Event Payload

`POST /v1/events` と `POST /v1/events/preview` は同じ payload を受け取ります。

必須フィールド：

| フィールド  | 型     | 意味                                                                      |
| ----------- | ------ | ------------------------------------------------------------------------- |
| `source`    | string | アプリまたは automation の安定名。例：`obsidian-sync-trakt`。             |
| `eventType` | string | 安定したイベント名。例：`sync.completed`、`sync.failed`、`auth.expired`。 |
| `target`    | string | YAML `targets` で設定された受信グループ。                                 |
| `title`     | string | 短い通知タイトル。                                                        |
| `message`   | string | 人間が読める通知本文。                                                    |

任意フィールド：

| フィールド  | 型                                    | 既定値  | 意味                                                     |
| ----------- | ------------------------------------- | ------- | -------------------------------------------------------- |
| `severity`  | `info`, `success`, `warning`, `error` | `info`  | 既定 routing と provider formatting に使う。             |
| `changed`   | boolean                               | `false` | 意味のある変更を表すかどうか。                           |
| `dedupeKey` | string                                | none    | dedupe window 内の重複 key は保存されるが送信されない。  |
| `items`     | array                                 | none    | ログや将来の formatting 用の構造化詳細。                 |
| `metadata`  | object                                | none    | 追加の machine-readable context。secret を入れないこと。 |

例：

```json
{
  "source": "obsidian-sync-trakt",
  "eventType": "sync.completed",
  "target": "me",
  "title": "Trakt sync completed",
  "message": "Wrote 3 Daily Notes.",
  "severity": "info",
  "changed": true,
  "dedupeKey": "obsidian-sync-trakt:2026-06-24:daily-notes",
  "items": [
    {
      "time": "09:12",
      "action": "watched",
      "title": "S01E03"
    }
  ]
}
```

## Routing Summary

PingBridge は既定で次の場合に通知を送ります。

- `severity` が `error`
- `eventType` が `.failed` で終わる
- `eventType` が `auth.expired`
- `changed` が `true`
- 設定済み rule に一致する

通常の成功イベントで `changed: false` の場合は `ignored` として保存されます。

## Health

```http
GET /v1/health
```

レスポンス：

```json
{
  "status": "ok"
}
```

## Preview Event

```http
POST /v1/events/preview
Authorization: Bearer <PINGBRIDGE_TOKEN>
Content-Type: application/json
```

`preview` は payload、routing、target channels、priority、dedupe state を検証します。ただし SQLite へ書き込まず、provider 通知も送りません。サードパーティプロジェクトのテストボタンはこれを優先してください。

```bash
curl -X POST http://127.0.0.1:8787/v1/events/preview \
  -H "Authorization: Bearer $PINGBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "my-app",
    "eventType": "task.completed",
    "target": "me",
    "title": "Preview only",
    "message": "This checks routing without sending.",
    "changed": true,
    "dedupeKey": "my-app:task.completed:2026-06-30"
  }'
```

レスポンス状態：`200 OK`

```json
{
  "status": "preview",
  "notify": true,
  "target": "me",
  "priority": "normal",
  "channels": [
    {
      "id": "ntfy_personal",
      "type": "ntfy"
    }
  ],
  "dedupe": {
    "key": "obsidian-sync-trakt:2026-06-24:daily-notes",
    "duplicate": false
  }
}
```

`notify: false` はイベントが有効だが現在の routing では送信されない、という意味です。たとえば `changed: false` の通常 `sync.completed` は多くの場合 ignored になります。

## Send Event

```http
POST /v1/events
Authorization: Bearer <PINGBRIDGE_TOKEN>
Content-Type: application/json
```

これは実送信 endpoint です。連携テストでは先に `/v1/events/preview` を呼び出してください。

```bash
curl -X POST http://127.0.0.1:8787/v1/events \
  -H "Authorization: Bearer $PINGBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "my-app",
    "eventType": "task.completed",
    "target": "me",
    "title": "Task completed",
    "message": "The scheduled task finished.",
    "changed": true,
    "dedupeKey": "my-app:task.completed:2026-06-30"
  }'
```

レスポンス状態：`202 Accepted`

Event status：

| Status            | 意味                                                         |
| ----------------- | ------------------------------------------------------------ |
| `delivered`       | 選択された全 channels が成功。                               |
| `partial_failure` | 少なくとも 1 channel が成功し、少なくとも 1 channel が失敗。 |
| `failed`          | 選択された全 channels が失敗。                               |
| `ignored`         | routing が送信しないと判断。                                 |
| `deduplicated`    | `dedupeKey` が dedupe window 内で既に受け入れ済み。          |

## その他 Endpoints

`POST /v1/channels/:id/test` は実テスト通知を送ります。サービス運用者向けであり、通常のアプリ連携テストには使わないでください。

`GET /v1/channels`、`GET /v1/events/recent?limit=20`、`GET /v1/deliveries/failed?limit=20`、`GET /v1/deliveries/:id` は bearer token が必要で、通知は送りません。

## Errors

エラーレスポンス形式：

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing or invalid bearer token."
  }
}
```

よくあるエラーコード：

| HTTP  | Code                 | 主な原因                                  |
| ----- | -------------------- | ----------------------------------------- |
| `400` | `invalid_json`       | request body が有効な JSON ではない。     |
| `400` | `invalid_event`      | 必須 event field が欠落または無効。       |
| `400` | `invalid_severity`   | `severity` が許可値ではない。             |
| `400` | `unknown_target`     | `target` が未設定。                       |
| `401` | `unauthorized`       | bearer token がない、または間違っている。 |
| `404` | `not_found`          | route が存在しない。                      |
| `404` | `channel_not_found`  | channel id が未設定。                     |
| `404` | `delivery_not_found` | delivery id が存在しない。                |
| `500` | `internal_error`     | 予期しないサーバーエラー。                |
