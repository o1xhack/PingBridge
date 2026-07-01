# PingBridge ドキュメント

PingBridge の既定ドキュメント言語は英語です。このディレクトリには日本語版の主要ドキュメントを置いています。

- [English](../README.md)
- [简体中文](../zh-CN/README.md)

## 最初に読むもの

| 読者                      | 入口                                                                         | 目的                                                          |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| アプリ / プラグイン開発者 | [他プロジェクトへの組み込み](integrating-other-projects.md)                  | PingBridge 通知を別プロジェクトへ追加する。                   |
| Agent / Codex 自動化      | [Agent ガイド](agent-guide.md)                                               | secret を漏らさず、予期しない実通知も送らずに安全に変更する。 |
| REST API ユーザー         | [REST API](api.md)                                                           | 任意の言語から PingBridge を呼び出す。                        |
| TypeScript ユーザー       | [TypeScript SDK](sdk.md)                                                     | アプリコードから `@pingbridge/client` を使う。                |
| サービス運用者            | [英語 Configuration](../configuration.md) と [英語 Security](../security.md) | PingBridge を起動し provider を設定する。                     |
| コントリビューター        | [英語 Testing](../testing.md)                                                | リリース前に変更を検証する。                                  |

## コアコンセプト

PingBridge はバックエンド通知サービスであり、ローカル送信ツールではありません。

サードパーティのアプリやプラグインは標準イベントを PingBridge に送ります。provider secret、ルーティング、重複排除、リトライ、delivery log、provider-specific API は PingBridge サーバー側が所有します。

標準の組み込みテスト順序は次の通りです。

1. `health()` でサービス到達性を確認する。
2. `preview(...)` で認証、payload、target、routing、priority、dedupe を確認する。ただし通知は送らない。
3. `notify(...)` でルーティングが許可した場合に実通知を送る。

## 現在の MVP

- Telegram Bot
- Bark
- ntfy
- REST API
- TypeScript client
- CLI
- MCP server
- YAML による channels、targets、rules の設定
- SQLite event / delivery logs
- 基本的な retry と dedupe
