# 测试

PingBridge 使用分层测试。目标不是数学证明完全正确，而是在发布或部署前捕捉不同类别的失败。

## Full Local Gate

```bash
npm run test:all
```

它会运行：

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

默认 gate 不会发送真实 Bark、ntfy 或 Telegram 通知。Docker smoke 会根据环境安全 skip。

包含真实 provider 通知：

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

这些检查 TypeScript、lint、格式和本地化文档入口。

## Unit / Integration / CLI / MCP

```bash
npm run test:unit
npm run test:integration
npm run test:cli
npm run test:mcp
```

当前覆盖：

- config environment expansion 和 validation
- Bark / ntfy provider presentation formatting
- TypeScript client request shape 和 error handling
- portable config SDK request shape
- bearer-token auth
- changed event delivery
- portable config health
- portable message preview / send
- portable provider config 会传给服务端 adapter
- portable provider secrets 不会写入 event payload
- unchanged success ignored
- failure delivery
- priority、dedupe、retry
- failed delivery listing
- test-channel endpoint
- channel listing
- CLI argument parsing 和 HTTP payload
- MCP tool handler contract

## Package Smoke

```bash
npm run test:package
```

这是 npm publishing gate。它会 clean/build、对所有 workspace 执行 `npm pack`、安装到临时 consumer project、导入 package、运行 CLI bin，并启动 packaged MCP stdio server 检查 tool list。

## External Consumer Smoke

```bash
npm run test:external
```

它会创建临时外部项目，安装 packed `@pingbridge/client` tarball，启动本地 PingBridge HTTP server，然后从外部项目调用 `health`、`checkConfig`、`previewMessage`、`sendMessage`。

该测试验证目标 Backend Notification as a Service 接入路径：

- App 安装 SDK
- App 保存 endpoint/token 和用户自己的 provider config
- App 检查 service health
- App 检查 portable config health
- App preview 单条 portable message，不发送
- App send 单条 portable message
- service 使用 portable channel config 通过 provider layer 发送

provider 是 fake，所以不会发送 Bark/ntfy/Telegram。

## Real Provider Smoke

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 npm run test:providers
```

脚本会自动读取本地 `.env`。如果有匹配 credentials，会发送真实通知。该测试不属于默认 `test:all`。

## Docker Smoke

```bash
npm run test:docker
```

它会检查 Docker CLI/daemon、build image、启动 container、poll `/v1/health`，最后清理。如果 Docker 不可用，会安全 skip。

CI 中如果要求 Docker 必须可用：

```bash
PINGBRIDGE_REQUIRE_DOCKER=1 npm run test:docker
```

## Release Gate Recommendation

普通 PR：

```bash
npm run test:all
```

带 provider credentials 和 Docker 的 release candidate：

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 \
PINGBRIDGE_REQUIRE_DOCKER=1 \
npm run test:all:real
```
