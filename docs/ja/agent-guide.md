# Agent ガイド

このガイドは PingBridge を理解または変更する coding agent / automation agent 向けです。

## プロダクト契約

PingBridge はバックエンド通知サービスです。ローカル送信ツールではありません。

サードパーティアプリは標準イベントを PingBridge に送ります。PingBridge は provider secrets、routing、dedupe、retry、delivery logs、provider-specific HTTP APIs を所有します。

標準フロー：

```text
app/plugin -> @pingbridge/client または REST API -> PingBridge service -> Telegram/Bark/ntfy
```

サードパーティアプリが保存するもの：

```text
endpoint
appToken
target
```

保存してはいけないもの：

```text
Telegram bot token
Bark device key
ntfy topic/token
PingBridge SQLite data
provider smoke credentials
```

## ドキュメントマップ

挙動やドキュメントを変更する前に、該当するファイルを確認してください。

| タスク                          | 必読ドキュメント                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| 新しいアプリ連携を追加          | `docs/integrating-other-projects.md`、`docs/sdk.md`、`docs/api.md`                             |
| REST 挙動を変更                 | `docs/api.md`、`docs/sdk.md`、`docs/testing.md`                                                |
| SDK 挙動を変更                  | `docs/sdk.md`、`docs/integrating-other-projects.md`、client tests                              |
| providers または secrets を変更 | `docs/configuration.md`、`docs/security.md`、`docs/provider-smoke-setup.md`                    |
| 多言語ドキュメントを変更        | `docs/README.md`、`docs/zh-CN/README.md`、`docs/ja/README.md`、`scripts/check-doc-locales.mjs` |
| release gate を変更             | `docs/testing.md`                                                                              |
| アーキテクチャを変更            | `docs/architecture.md`                                                                         |

## 安全なテストルール

通常の変更では次を使います。

```bash
npm run test:all
```

これは既定の quiet gate です。実際の Bark、ntfy、Telegram 通知を送ってはいけません。

実 provider delivery を明示的に確認するときだけ次を使います。

```bash
npm run test:all:real
```

実 provider 値はローカル `.env` に置きます。ログに出したり、commit したり、公開ドキュメントへコピーしたりしないでください。

## 連携テスト順序

別プロジェクトに PingBridge を組み込むときは、この順序を使います。

1. `health()` でサービス到達性を確認する。
2. `preview(...)` で payload、auth、target、routing、priority、dedupe を確認する。通知は送らない。
3. `notify(...)` で実通知を送る。

最初の接続テストに `notify(...)` を使わないでください。実 push のノイズが増え、失敗時の診断も難しくなります。

## Agent Checklist

コード変更前：

- 変更が server API、SDK API、CLI、MCP、docs、provider behavior のどれに影響するか確認する。
- 影響するドキュメントを更新する。新しい SDK method は通常 `docs/sdk.md`、`docs/api.md`、`docs/integrating-other-projects.md`、tests に影響します。
- 例はコピー可能にし、placeholder secrets だけを使う。
- `preview` は通知を送らない、という意味を保つ。
- 英語を既定のドキュメントパスとし、core integration docs を変更した場合は `docs/zh-CN` と `docs/ja` も更新する。
- 既定テストは quiet のままにする。

commit 前：

```bash
npm run format:write
npm run docs:check
npm run test:all
git status --short
```

package publish 前：

```bash
npm run test:package
npm run test:external
npm whoami
```

`npm whoami` が `ENEEDAUTH` を返す場合、npm 認証が設定されるまで publish はブロックされています。
