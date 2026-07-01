# Provider Smoke Setup

Provider smoke test は実通知を送ります。既定の `npm run test:all` では実行されません。

実 delivery を明示的に確認する場合だけ実行してください。

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 npm run test:providers
```

release candidate gate に含める場合：

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 npm run test:all:real
```

script は repository root の `.env` を自動で読みます。`.env` は gitignored です。commit しないでください。

## Bark

iPhone に Bark をインストールし、device key をコピーして `.env` に設定します。

```bash
BARK_DEVICE_KEY=replace-with-your-bark-device-key
BARK_ENDPOINT=https://api.day.app
```

Bark device key は送信権限と同等です。公開ドキュメント、GitHub issue、README、長期記憶に置かないでください。

## ntfy

ntfy topic は subscribe または publish で自然に作成できます。public topic には Bark のような device key がありません。topic name 自体が shared secret に近く、知っている人は subscribe または publish できる可能性があります。

テストには長い random topic を使います。

```bash
NTFY_SERVER=https://ntfy.sh
NTFY_TOPIC=replace-with-a-long-random-topic
NTFY_TOKEN=
```

authenticated ntfy server を使う場合は `NTFY_TOKEN` も設定してください。

公開ドキュメントでは placeholder または throwaway topic だけを使ってください。実固定 topic は公開しないでください。

## Telegram

Telegram をテストする場合：

```bash
TELEGRAM_BOT_TOKEN=replace-with-bot-token
TELEGRAM_CHAT_ID=replace-with-chat-id
```

Bot token は secret です。commit しないでください。

## 期待される出力

明示的に有効化していない場合：

```text
provider smoke: skipped
```

有効化され provider が成功した場合：

```text
provider smoke: ok (bark_smoke, ntfy_smoke)
```

provider config が不足している場合、script は該当 provider を skip するか設定問題を表示します。実 provider smoke を通常開発の既定 gate にしないでください。
