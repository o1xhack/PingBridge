# Provider Smoke Setup

Provider smoke test 会发送真实通知。默认 `npm run test:all` 不会运行它。

只有明确要检查真实 delivery 时才运行：

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 npm run test:providers
```

或者包含在 release candidate gate 中：

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 npm run test:all:real
```

本脚本会自动读取仓库根目录 `.env`。`.env` 已被 git 忽略，不要提交。

## Bark

在 iPhone 上安装 Bark，复制 device key，然后在 `.env` 中配置：

```bash
BARK_DEVICE_KEY=replace-with-your-bark-device-key
BARK_ENDPOINT=https://api.day.app
```

Bark device key 等同于可发送权限，不要放进公开文档、GitHub issue、README 或长期记忆。

## ntfy

ntfy topic 可以通过订阅或 publish 自然创建。public topic 没有 Bark 那种 device key；topic name 本身接近 shared secret。知道 topic 的人可能订阅或发布。

测试时使用长随机 topic：

```bash
NTFY_SERVER=https://ntfy.sh
NTFY_TOPIC=replace-with-a-long-random-topic
NTFY_TOKEN=
```

如果使用 authenticated ntfy server，再填写 `NTFY_TOKEN`。

公开文档只能使用 placeholder 或 throwaway topic。不要公开真实固定 topic。

## Telegram

如果要测试 Telegram：

```bash
TELEGRAM_BOT_TOKEN=replace-with-bot-token
TELEGRAM_CHAT_ID=replace-with-chat-id
```

Bot token 是 secret。不要提交。

## 预期输出

未显式启用时：

```text
provider smoke: skipped
```

启用且 provider 成功时：

```text
provider smoke: ok (bark_smoke, ntfy_smoke)
```

如果 provider 配置缺失，脚本会跳过对应 provider 或提示配置问题。真实 provider smoke 不应用作每次普通开发的默认 gate。
