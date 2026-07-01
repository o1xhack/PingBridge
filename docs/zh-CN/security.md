# 安全

PingBridge 面向 self-hosted trusted environments，但它仍然处理 notification secrets。

## Token Boundary

设置 `server.appToken`，并要求调用方发送：

```http
Authorization: Bearer <token>
```

如果 `server.appToken` 为空，API endpoints 不需要鉴权。只应在隔离的本地实验中这样做。

## Secret Placement

第三方 App 不应保存 provider secrets：

- Obsidian plugin 中不要保存 Telegram bot token
- shell scripts 中不要保存 Bark device key
- automation repos 中不要保存 ntfy private token

这些值应保存在 PingBridge server environment，并通过 YAML `${NAME}` 引用。

## ntfy Topics

public ntfy topic 如果名称较弱，可能被猜到。使用长的 private topic name 或 authenticated ntfy server。

## Logs

SQLite 会存储 event payload 和 delivery errors。不要把 password、access token、one-time code、私人联系方式或敏感个人数据放进 `title`、`message`、`items`、`metadata`。

## Network Exposure

本地使用时绑定 `127.0.0.1`。

Docker 或 LAN 使用时，只有在 firewall、reverse proxy 或 private network boundary 后面才绑定 `0.0.0.0`。

## Rotation

以下内容应独立轮换：

- `PINGBRIDGE_TOKEN`
- Telegram bot token
- Bark device key
- ntfy token/topic

轮换后重启 PingBridge server，确保环境变量展开后的配置重新加载。
