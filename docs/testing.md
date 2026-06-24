# Testing

PingBridge uses layered tests. The goal is not to prove the software is mathematically perfect; the goal is to catch different classes of failure before publishing or deploying.

## Full Local Gate

```bash
npm run test:all
```

This runs:

1. build
2. TypeScript typecheck
3. ESLint
4. Prettier check
5. unit tests
6. HTTP integration tests
7. CLI tests
8. MCP handler tests
9. npm package smoke test
10. provider smoke test
11. Docker smoke test
12. moderate-or-higher npm audit gate

Provider and Docker smoke tests are environment-aware. They skip safely when the required external dependency is not available.

## 1. Static Checks

```bash
npm run typecheck
npm run lint
npm run format:check
```

These catch TypeScript errors, obvious code defects, and formatting drift.

## 2. Unit Tests

```bash
npm run test:unit
```

Current unit coverage includes:

- config environment expansion
- config validation
- TypeScript client request shape and error handling

## 3. Integration Tests

```bash
npm run test:integration
```

The integration test starts the real HTTP server with in-memory SQLite and fake providers. It verifies:

- bearer-token auth
- changed event delivery
- unchanged success event ignored
- failure event delivery
- priority behavior
- dedupe behavior
- retry behavior
- failed delivery listing
- test-channel endpoint
- channel listing

## 4. CLI Tests

```bash
npm run test:cli
```

The CLI tests verify:

- argument parsing
- boolean parsing
- required option errors
- stdout/stderr behavior
- bearer token propagation
- HTTP request payload shape

## 5. MCP Tests

```bash
npm run test:mcp
```

The MCP unit tests verify the tool handler contract. The npm package smoke test also starts the packaged MCP stdio server and verifies the published tool list.

## 6. npm Package Smoke Test

```bash
npm run test:package
```

This is the npm-publishing gate. It:

1. cleans `dist` and TypeScript build info
2. builds all workspaces
3. runs `npm pack` for each package
4. installs the tarballs into a temporary consumer project
5. imports `@pingbridge/client`, `@pingbridge/server`, and `@pingbridge/cli`
6. runs the installed `pingbridge` bin
7. starts the installed `pingbridge-mcp` stdio server and checks its tool list

This catches packaging bugs that normal unit tests do not catch, such as missing `dist`, bad `exports`, bad `types`, and bin symlink entrypoint issues.

## 7. Real Provider Smoke Test

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 npm run test:providers
```

The script also reads local `.env` automatically. Keep `.env` local; it is ignored by git.

This sends real notifications if matching credentials are present:

Telegram:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Bark:

```bash
BARK_DEVICE_KEY=...
BARK_ENDPOINT=https://api.day.app
```

ntfy:

```bash
NTFY_TOPIC=...
NTFY_SERVER=https://ntfy.sh
NTFY_TOKEN=...
```

If `PINGBRIDGE_RUN_PROVIDER_SMOKE` is not `1`, this test prints a skip message and exits successfully to avoid accidental real notifications.

See [Provider Smoke Setup](provider-smoke-setup.md) for how to obtain Bark and ntfy test values.

## 8. Docker Smoke Test

```bash
npm run test:docker
```

This test:

1. checks for Docker CLI and daemon
2. builds the Docker image
3. starts a container with a temporary config
4. polls `/v1/health`
5. stops and removes the container/image

If Docker is unavailable, it prints a skip message and exits successfully. In CI, set this to make Docker unavailable a failure:

```bash
PINGBRIDGE_REQUIRE_DOCKER=1 npm run test:docker
```

## Release Gate Recommendation

For a normal PR:

```bash
npm run test:all
```

For a release candidate with provider credentials and Docker available:

```bash
PINGBRIDGE_RUN_PROVIDER_SMOKE=1 \
PINGBRIDGE_REQUIRE_DOCKER=1 \
npm run test:all
```
