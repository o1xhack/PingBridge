# テスト

PingBridge は layered tests を使います。目的は数学的な完全性の証明ではなく、publish または deploy 前に異なる種類の失敗を捕捉することです。

## Full Local Gate

```bash
npm run test:all
```

実行内容：

1. build
2. TypeScript typecheck
3. ESLint
4. Prettier check
5. documentation locale coverage check
6. unit tests
7. HTTP integration tests
8. CLI tests
9. MCP handler tests
10. npm package smoke test
11. external consumer smoke test
12. Docker smoke test
13. moderate-or-higher npm audit gate

既定 gate は実 Bark、ntfy、Telegram 通知を送りません。Docker smoke は環境に応じて安全に skip します。

実 provider 通知を含める場合：

```bash
npm run test:all:real
```

## Static Checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm run docs:check
```

TypeScript、lint、format、localized documentation entrypoints を確認します。

## Unit / Integration / CLI / MCP

```bash
npm run test:unit
npm run test:integration
npm run test:cli
npm run test:mcp
```

現在のカバレッジ：

- config environment expansion と validation
- TypeScript client request shape と error handling
- bearer-token auth
- changed event delivery
- unchanged success ignored
- failure delivery
- priority、dedupe、retry
- failed delivery listing
- test-channel endpoint
- channel listing
- CLI argument parsing と HTTP payload
- MCP tool handler contract

## Package Smoke

```bash
npm run test:package
```

npm publishing gate です。clean/build、各 workspace の `npm pack`、一時 consumer project への install、package import、CLI bin 実行、packaged MCP stdio server の tool list 確認を行います。

## External Consumer Smoke

```bash
npm run test:external
```

一時的な外部プロジェクトを作成し、packed `@pingbridge/client` tarball をインストールし、ローカル PingBridge HTTP server を起動して `health`、`preview`、`notify` を呼び出します。

provider は fake なので Bark/ntfy/Telegram は送られません。

## Real Provider Smoke

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 npm run test:providers
```

script はローカル `.env` を自動で読みます。matching credentials がある場合は実通知を送ります。このテストは既定 `test:all` には含まれません。

## Docker Smoke

```bash
npm run test:docker
```

Docker CLI/daemon を確認し、image を build し、container を起動し、`/v1/health` を poll してから cleanup します。Docker が利用できない場合は安全に skip します。

CI で Docker 必須にする場合：

```bash
PINGBRIDGE_REQUIRE_DOCKER=1 npm run test:docker
```

## Release Gate Recommendation

通常 PR：

```bash
npm run test:all
```

provider credentials と Docker を含む release candidate：

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 \
PINGBRIDGE_REQUIRE_DOCKER=1 \
npm run test:all:real
```
