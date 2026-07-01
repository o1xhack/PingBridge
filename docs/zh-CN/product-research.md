# 产品研究笔记

PingBridge 对照了正在维护的 notification infrastructure 和 self-hosted notification 项目。

## Reviewed Projects

| Project  | Reference                                                                      | 借鉴点                                                                     |
| -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Novu     | https://docs.novu.co/platform/what-is-novu 和 https://github.com/novuhq/novu   | API-first notification infrastructure；App 触发统一 backend API。          |
| Knock    | https://docs.knock.app/send-notifications/triggering-workflows/api             | workflow trigger API 接收高层 trigger payload，由后端执行跨渠道 delivery。 |
| SuprSend | https://docs.suprsend.com/docs/user-preferences 和 https://github.com/SuprSend | user preferences 和 channel choices 是一等产品概念。                       |
| Gotify   | https://github.com/gotify                                                      | self-hosted push server，简单 API 和 application identity。                |
| ntfy     | https://github.com/binwiederhier/ntfy                                          | 简单 HTTP publish/subscribe，终端用户容易配置和测试。                      |
| Apprise  | https://github.com/caronc/apprise                                              | provider abstraction layer，把多种 destination 统一成一个发送接口。        |

## 产品结论

行业共同形态不是“每个 App 自己调 provider API”，而是统一 notification boundary：

1. App 触发 backend notification API。
2. 用户或 operator 定义通知偏好和渠道。
3. notification service 负责 provider adaptation、formatting、routing、retry 和 observability。
4. App developer 只接一个 API/SDK，而不是重复实现 Bark、Telegram、ntfy、email、SMS 或 push 逻辑。

## PingBridge 1.0 含义

PingBridge 应该作为给开发者 App/plugin 使用的 Backend Notification as a Service。

必要流程是：

1. App developer 安装 `@pingbridge/client` 或调用 REST。
2. App 暴露 PingBridge endpoint/token 和用户通知渠道 settings。
3. 用户选择 Bark、Telegram、ntfy 或多个渠道，并填入自己的 provider values。
4. App 把 portable config 传给 PingBridge。
5. PingBridge 用 `checkConfig` / `/v1/configs/health` 校验 config。
6. PingBridge 用 `previewMessage` / `/v1/messages/preview` 预览单条 message。
7. PingBridge 用 `sendMessage` / `/v1/messages` 发送。

SDK 因此暴露：

- `health()`
- `checkConfig(...)`
- `previewMessage(...)`
- `sendMessage(...)`
- legacy/static-target helpers：`preview(...)`、`notify(...)`、`changed(...)`、`failed(...)`、`authExpired(...)`

测试因此覆盖：

- portable config HTTP integration
- provider formatting unit tests
- package smoke tests
- external consumer smoke tests
- 默认 quiet gate 与真实 provider smoke 分离

## 1.0 刻意不做

- visual workflow builder
- hosted SaaS accounts
- multi-tenant dashboard
- preference-center UI components
- queue/worker architecture
- email/SMS/in-app inbox providers

  1.0 范围是 portable notification config contract、Bark/Telegram Bot/ntfy adapters、app name/icon/group customization、config health、message preview、message send，以及 TypeScript SDK。
