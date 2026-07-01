# Product Research Notes

PingBridge は actively maintained notification infrastructure と self-hosted notification projects と比較しました。

## Reviewed Projects

| Project  | Reference                                                                       | Borrowed Pattern                                                                                  |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Novu     | https://docs.novu.co/platform/what-is-novu and https://github.com/novuhq/novu   | API-first notification infrastructure。App は unified backend API を trigger する。               |
| Knock    | https://docs.knock.app/send-notifications/triggering-workflows/api              | workflow trigger API が high-level trigger payload を受け取り cross-channel delivery を実行する。 |
| SuprSend | https://docs.suprsend.com/docs/user-preferences and https://github.com/SuprSend | user preferences と channel choices を first-class concept として扱う。                           |
| Gotify   | https://github.com/gotify                                                       | self-hosted push server、simple API、application identity。                                       |
| ntfy     | https://github.com/binwiederhier/ntfy                                           | simple HTTP publish/subscribe model。end user が設定しやすい。                                    |
| Apprise  | https://github.com/caronc/apprise                                               | provider abstraction layer。many destinations を one sending interface に正規化する。             |

## Product Conclusions

共通パターンは「各 App が provider APIs を直接呼ぶ」ことではありません。価値は unified notification boundary です。

1. App は backend notification API を trigger する。
2. users/operators が notification preferences と channels を定義する。
3. notification service が provider adaptation、formatting、routing、retry、observability を担当する。
4. App developer は Bark、Telegram、ntfy、email、SMS、push logic を繰り返し実装しない。

## PingBridge 1.0 Implications

PingBridge は developer-owned apps/plugins 向け Backend Notification as a Service として扱います。

required flow:

1. App developer が `@o1x/pingbridge-client` または REST を使う。
2. App が PingBridge endpoint/token と user notification channel settings を公開する。
3. user が Bark、Telegram、ntfy、または複数 channel を選び、自分の provider values を入力する。
4. App が portable config を PingBridge に渡す。
5. PingBridge が `checkConfig` / `/v1/configs/health` で config を検証する。
6. PingBridge が `previewMessage` / `/v1/messages/preview` で 1 message を preview する。
7. PingBridge が `sendMessage` / `/v1/messages` で送信する。

SDK methods:

- `health()`
- `checkConfig(...)`
- `previewMessage(...)`
- `sendMessage(...)`
- legacy/static-target helpers: `preview(...)`, `notify(...)`, `changed(...)`, `failed(...)`, `authExpired(...)`

Tests cover:

- portable config HTTP integration
- provider formatting unit tests
- package smoke tests
- external consumer smoke tests
- default quiet gate と real provider smoke の分離

## Deliberate 1.0 Limits

- visual workflow builder
- hosted SaaS accounts
- multi-tenant dashboard
- preference-center UI components
- queue/worker architecture
- email/SMS/in-app inbox providers

  1.0 scope は portable notification config contract、Bark/Telegram Bot/ntfy adapters、app name/icon/group customization、config health、message preview、message send、TypeScript SDK です。
