# PingBridge ドキュメント

PingBridge の既定ドキュメント言語は英語です。このディレクトリには日本語版の主要ドキュメントを置いています。

- [English](../README.md)
- [简体中文](../zh-CN/README.md)

## 最初に読むもの

| 読者                                | 入口                                                                       | 目的                                                          |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| アプリ / プラグイン開発者           | [他プロジェクトへの組み込み](integrating-other-projects.md)                | PingBridge 通知を別プロジェクトへ追加する。                   |
| Agent / Codex 自動化                | [Agent ガイド](agent-guide.md)                                             | secret を漏らさず、予期しない実通知も送らずに安全に変更する。 |
| REST API ユーザー                   | [REST API](api.md)                                                         | 任意の言語から PingBridge を呼び出す。                        |
| TypeScript ユーザー                 | [TypeScript SDK](sdk.md)                                                   | アプリコードから `@o1x/pingbridge-client` を使う。            |
| サービス運用者                      | [設定](configuration.md) と [セキュリティ](security.md)                    | PingBridge を起動し provider を設定する。                     |
| コントリビューター                  | [テスト](testing.md)                                                       | リリース前に変更を検証する。                                  |
| Provider テスター                   | [Provider Smoke Setup](provider-smoke-setup.md)                            | ローカルで実 Bark、ntfy、Telegram smoke test を設定する。     |
| プロダクト / アーキテクチャレビュー | [アーキテクチャ](architecture.md) と [プロダクト調査](product-research.md) | MVP 境界と参考プロジェクトを理解する。                        |
| MCP ユーザー                        | [MCP](mcp.md)                                                              | Agent tool 環境から PingBridge を呼び出す。                   |
| Obsidian 連携                       | [Obsidian 連携](obsidian-integration.md)                                   | Obsidian plugin または sync project に組み込む。              |

## コアコンセプト

PingBridge は Backend Notification as a Service であり、ローカル送信ツールではありません。

サードパーティのアプリやプラグインは user-owned notification config と message を PingBridge に渡します。provider adaptation、routing、formatting、dedupe、retry、delivery logs、provider-specific API は PingBridge が担当します。

標準の組み込みテスト順序は次の通りです。

1. `health()` でサービス到達性を確認する。
2. `checkConfig(...)` で user channel config を確認する。ただし通知は送らない。
3. `previewMessage(...)` で 1 件の message を確認する。ただし通知は送らない。
4. `sendMessage(...)` で routing が許可した場合に実通知を送る。

古い `preview(...)` と `notify(...)` は YAML static targets、CLI、MCP automation 向けに残っています。

## 現在の MVP

- Telegram Bot
- Bark
- ntfy
- REST API
- TypeScript client
- CLI
- MCP server
- App/plugin portable user config
- YAML による channels、targets、rules の設定
- SQLite event / delivery logs
- 基本的な retry と dedupe
