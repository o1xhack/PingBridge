# REST API

PingBridge 提供小而清晰的 REST API，供 App、插件、CLI 和 Agent 调用。

非 TypeScript 项目，或不能使用 `@pingbridge/client` 的项目，应直接调用 REST API。

## Endpoint Index

| Method | Path                             | 是否发送通知   | 用途                                                      |
| ------ | -------------------------------- | -------------- | --------------------------------------------------------- |
| `GET`  | `/v1/health`                     | 否             | 检查服务是否可达。                                        |
| `POST` | `/v1/events/preview`             | 否             | 检查 payload、auth、target、routing、priority 和 dedupe。 |
| `POST` | `/v1/events`                     | 取决于 routing | 提交真实事件。                                            |
| `GET`  | `/v1/channels`                   | 否             | 列出已配置 channel id 和类型。                            |
| `POST` | `/v1/channels/:id/test`          | 是             | 给单个 provider channel 发送测试消息。                    |
| `GET`  | `/v1/events/recent?limit=20`     | 否             | 查看最近存储的 events。                                   |
| `GET`  | `/v1/deliveries/failed?limit=20` | 否             | 查看最近失败的 provider deliveries。                      |
| `GET`  | `/v1/deliveries/:id`             | 否             | 查看单条 delivery result。                                |

## Auth

当 `server.appToken` 已配置时，除 `/v1/health` 外的所有 endpoint 都需要 bearer token：

```http
Authorization: Bearer <PINGBRIDGE_TOKEN>
```

如果 `server.appToken` 为空，受保护 endpoint 将不需要鉴权。只应在隔离的本地实验中这样做。

## 标准 Event Payload

`POST /v1/events` 和 `POST /v1/events/preview` 使用同一套 payload。

必填字段：

| 字段        | 类型   | 含义                                                               |
| ----------- | ------ | ------------------------------------------------------------------ |
| `source`    | string | App 或 automation 的稳定名称，例如 `obsidian-sync-trakt`。         |
| `eventType` | string | 稳定事件名，例如 `sync.completed`、`sync.failed`、`auth.expired`。 |
| `target`    | string | YAML `targets` 中配置的收件人组。                                  |
| `title`     | string | 简短通知标题。                                                     |
| `message`   | string | 人类可读的通知正文。                                               |

可选字段：

| 字段        | 类型                                  | 默认值  | 含义                                            |
| ----------- | ------------------------------------- | ------- | ----------------------------------------------- |
| `severity`  | `info`, `success`, `warning`, `error` | `info`  | 用于默认 routing 和 provider formatting。       |
| `changed`   | boolean                               | `false` | 事件是否代表有意义的变化。                      |
| `dedupeKey` | string                                | none    | dedupe window 内重复的 key 会被存储但不会发送。 |
| `items`     | array                                 | none    | 结构化详情，便于日志或未来格式化。              |
| `metadata`  | object                                | none    | 额外机器可读上下文。不要放 secrets。            |

示例：

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

默认情况下，PingBridge 会在以下情况发送通知：

- `severity` 是 `error`
- `eventType` 以 `.failed` 结尾
- `eventType` 是 `auth.expired`
- `changed` 是 `true`
- 匹配到配置的 rule

普通成功事件且 `changed: false` 会被存储为 `ignored`。

## Health

```http
GET /v1/health
```

响应：

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

`preview` 会验证 payload、routing、target channels、priority 和 dedupe state，但不会写入 SQLite，也不会发送 provider 通知。第三方项目的测试按钮应优先调用它。

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

响应状态：`200 OK`

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

`notify: false` 表示事件合法，但当前 routing 不会发送。例如 `changed: false` 的普通 `sync.completed` 通常会被忽略。

## Send Event

```http
POST /v1/events
Authorization: Bearer <PINGBRIDGE_TOKEN>
Content-Type: application/json
```

这是会触发真实发送的 endpoint。测试接入时应先调用 `/v1/events/preview`。

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

响应状态：`202 Accepted`

Event status：

| Status            | 含义                                        |
| ----------------- | ------------------------------------------- |
| `delivered`       | 所有选中的 channels 都发送成功。            |
| `partial_failure` | 至少一个 channel 成功，至少一个失败。       |
| `failed`          | 所有选中的 channels 都失败。                |
| `ignored`         | routing 决定不发送。                        |
| `deduplicated`    | `dedupeKey` 在 dedupe window 内已被接受过。 |

## 其他 Endpoints

`POST /v1/channels/:id/test` 会发送真实测试通知，只应由服务运维者使用，不应用作普通 App 接入测试。

`GET /v1/channels`、`GET /v1/events/recent?limit=20`、`GET /v1/deliveries/failed?limit=20` 和 `GET /v1/deliveries/:id` 都需要 bearer token，且不会发送通知。

## Errors

错误响应格式：

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing or invalid bearer token."
  }
}
```

常见错误码：

| HTTP  | Code                 | 常见原因                    |
| ----- | -------------------- | --------------------------- |
| `400` | `invalid_json`       | 请求体不是合法 JSON。       |
| `400` | `invalid_event`      | 必填 event 字段缺失或无效。 |
| `400` | `invalid_severity`   | `severity` 不是允许值。     |
| `400` | `unknown_target`     | `target` 未配置。           |
| `401` | `unauthorized`       | bearer token 缺失或错误。   |
| `404` | `not_found`          | route 不存在。              |
| `404` | `channel_not_found`  | channel id 未配置。         |
| `404` | `delivery_not_found` | delivery id 不存在。        |
| `500` | `internal_error`     | 未预期的服务端错误。        |
