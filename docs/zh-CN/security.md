# 安全

PingBridge 面向 self-hosted trusted environments，但它仍然处理 notification secrets。

## Token Boundary

设置 `server.appToken`，并要求调用方发送：

```http
Authorization: Bearer <token>
```

如果 `server.appToken` 为空，API endpoints 不需要鉴权。只应在隔离的本地实验中这样做。

## Secret Placement

PingBridge 支持两种 secret placement。

service-managed YAML targets：provider values 保存在 PingBridge server environment，并通过 YAML `${NAME}` 引用。

portable App/plugin integrations：用户可以把 Bark、Telegram 或 ntfy settings 填入 App。App 可以把这些值保存在用户本地 settings 或 secret store，但必须按 secret 处理：

- 不要提交到仓库
- 不要打印到日志
- 不要放进 `message`、`items`、`metadata`、title 或 error
- 不要发送给不相关的服务

PingBridge 只在当前请求中使用 portable provider config。它会存 normalized event 和 delivery result，但不会把 portable Bark device key、Telegram bot token、ntfy token/topic 存入 SQLite event payload。

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
