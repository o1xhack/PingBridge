# セキュリティ

PingBridge は self-hosted trusted environments 向けですが、notification secrets を扱います。

## Token Boundary

`server.appToken` を設定し、呼び出し側に次の header を送らせます。

```http
Authorization: Bearer <token>
```

`server.appToken` が空の場合、API endpoints は unauthenticated になります。隔離されたローカル実験だけで使ってください。

## Secret Placement

PingBridge は 2 つの secret placement model をサポートします。

service-managed YAML targets では、provider values を PingBridge server environment に保存し、YAML から `${NAME}` で参照します。

portable App/plugin integrations では、ユーザーが Bark、Telegram、ntfy settings を App に入力できます。App はそれらを user local settings または secret store に保存できますが、secret として扱ってください。

- repository に commit しない
- logs に出さない
- `message`、`items`、`metadata`、title、error に入れない
- 無関係な service に送らない

PingBridge は portable provider config を current request でだけ使います。normalized event と delivery result は保存しますが、portable Bark device key、Telegram bot token、ntfy token/topic は SQLite event payload に保存しません。

## ntfy Topics

public ntfy topics は弱い名前だと推測される可能性があります。長い private topic name または authenticated ntfy server を使ってください。

## Logs

SQLite は event payload と delivery errors を保存します。password、access token、one-time code、個人連絡先、機微な個人データを `title`、`message`、`items`、`metadata` に入れないでください。

## Network Exposure

ローカル専用なら `127.0.0.1` に bind します。

Docker または LAN で使う場合、firewall、reverse proxy、private network boundary の背後でのみ `0.0.0.0` に bind してください。

## Rotation

次は個別に rotate してください。

- `PINGBRIDGE_TOKEN`
- Telegram bot token
- Bark device key
- ntfy token/topic

rotation 後は PingBridge server を再起動し、environment-expanded config を再読み込みしてください。
