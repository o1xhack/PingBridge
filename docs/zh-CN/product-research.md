# 产品研究记录

这个 MVP 对照了 GitHub 上仍在活跃维护的 notification / BaaS-style 项目。

## Reviewed Projects

| Project | GitHub                                | 可借鉴模式                                                                                                            |
| ------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Novu    | https://github.com/novuhq/novu        | notification infrastructure 暴露 backend API 和 SDK；App 触发 notification workflow，而不是每个 provider 都自己集成。 |
| ntfy    | https://github.com/binwiederhier/ntfy | 简单 HTTP publish/subscribe API；topic 可以通过 publish/subscribe 使用，容易用 curl 测试。                            |
| Gotify  | https://github.com/gotify/server      | self-hosted push service，server-side app tokens，简单 message API。                                                  |
| Apprise | https://github.com/caronc/apprise     | provider abstraction layer；许多通知目的地归一到一个 sending interface。                                              |

2026-06-30 检查 GitHub metadata 时，四个 repo 都在 2026 年 6 月有近期 push，且使用量较高：Novu 约 39k stars，ntfy 约 31k，Apprise 约 16k，Gotify 约 15k。

## 对 PingBridge MVP 的影响

PingBridge 应被视为后端通知服务，而不是 local-only sender。

最小可用流程：

1. PingBridge service operator 一次性配置 provider secrets。
2. App developer 安装 PingBridge SDK。
3. App 只保存 `endpoint`、`appToken` 和 `target`。
4. App 可以运行 `health` 和 `preview` 测试，不发送真实通知。
5. App 调用 `notify` 进行真实 user-visible delivery。

因此 SDK 暴露：

- `health()`
- `preview(...)`
- `notify(...)`
- `changed(...)`
- `failed(...)`
- `authExpired(...)`

仓库也包含：

- `@pingbridge/client` 的 publishable package metadata
- package smoke tests
- external consumer smoke tests
- 与默认 quiet gate 分离的 provider smoke tests
