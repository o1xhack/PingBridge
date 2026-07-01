# プロダクト調査ノート

この MVP は GitHub で現在も活発に保守されている notification / BaaS-style projects と照合しました。

## Reviewed Projects

| Project | GitHub                                | 借りるべきパターン                                                                                                           |
| ------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Novu    | https://github.com/novuhq/novu        | notification infrastructure が backend API と SDKs を公開し、アプリは各 provider を直接組み込まず workflow を trigger する。 |
| ntfy    | https://github.com/binwiederhier/ntfy | シンプルな HTTP publish/subscribe API。topic は publish/subscribe で使え、curl でテストしやすい。                            |
| Gotify  | https://github.com/gotify/server      | self-hosted push service。server-side app tokens とシンプルな message API。                                                  |
| Apprise | https://github.com/caronc/apprise     | provider abstraction layer。多数の通知先を 1 つの sending interface に正規化する。                                           |

2026-06-30 に GitHub metadata を確認した時点で、4 repo すべてが 2026 年 6 月に最近 push され、利用も多い状態でした。Novu は約 39k stars、ntfy は約 31k、Apprise は約 16k、Gotify は約 15k。

## PingBridge MVP への影響

PingBridge は backend notification service として扱うべきであり、local-only sender ではありません。

最小利用フロー：

1. PingBridge service operator が provider secrets を一度だけ設定する。
2. App developer が PingBridge SDK をインストールする。
3. App は `endpoint`、`appToken`、`target` だけを保存する。
4. App は実通知を送らずに `health` と `preview` を実行できる。
5. App は `notify` で user-visible delivery を実行する。

そのため SDK は次を公開します。

- `health()`
- `preview(...)`
- `notify(...)`
- `changed(...)`
- `failed(...)`
- `authExpired(...)`

repository には次も含まれます。

- `@pingbridge/client` の publishable package metadata
- package smoke tests
- external consumer smoke tests
- 既定 quiet gate から分離された provider smoke tests
