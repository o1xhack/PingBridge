# Provider Smoke Setup

This guide explains how to set up real local smoke tests for Bark and ntfy without committing secrets.

`scripts/provider-smoke.mjs` automatically reads `.env` from the repository root. `.env` is ignored by git.

## Canonical Local Smoke Channels

For this project, keep one stable local `.env` and reuse the same Bark device key and ntfy topic for future development and testing. Do not rotate them unless they are compromised or intentionally retired.

This gives every future change the same real provider gate:

```bash
npm run test:providers
```

If `.env` contains `PINGBRIDGE_RUN_PROVIDER_SMOKE=1`, that command sends real notifications to the configured Bark and ntfy channels.

Do not use real provider smoke for every routine edit. The default test gate is intentionally quiet:

```bash
npm run test:all
```

Use real notifications only when explicitly validating providers or release readiness:

```bash
npm run test:all:real
```

## Local `.env`

Copy the example file:

```bash
cp .env.example .env
```

For provider smoke tests, set:

```dotenv
PINGBRIDGE_RUN_PROVIDER_SMOKE=1

# ntfy
NTFY_SERVER=https://ntfy.sh
NTFY_TOPIC=replace-with-a-long-random-topic
NTFY_TOKEN=

# Bark
BARK_ENDPOINT=https://api.day.app
BARK_DEVICE_KEY=replace-with-your-bark-device-key
```

Do not commit `.env`.

The repository `.gitignore` also ignores `.env.*`, `*.local`, `*.secret`, `secrets/`, local PingBridge config files, SQLite data, and provider-smoke local files. Keep real provider keys and real ntfy topics in those ignored local files only.

## ntfy

ntfy does not require approval for a basic public-topic test. Topics are created when you subscribe or publish.

For public `ntfy.sh` topics, the topic name is effectively a shared secret. Anyone who knows the topic can subscribe and, unless the topic is otherwise protected, publish to it. Do not commit or document the real long-lived smoke-test topic.

For docs, examples, demos, and screenshots, use a placeholder or a one-time throwaway topic:

```text
pingbridge-test-<random-uuid>
```

For long-lived project testing, use the stable random topic in local `.env`.

1. Install/open the ntfy app or use the web app.
2. Subscribe to a long random topic, for example:

   ```text
   pingbridge-test-20260624-<random-words-or-uuid>
   ```

3. Put that value into `.env`:

   ```dotenv
   NTFY_SERVER=https://ntfy.sh
   NTFY_TOPIC=pingbridge-test-20260624-<random-words-or-uuid>
   ```

4. Optional manual direct check:

   ```bash
   curl -d "PingBridge ntfy direct check" "https://ntfy.sh/$NTFY_TOPIC"
   ```

5. Run PingBridge provider smoke:

   ```bash
   npm run build
   npm run test:providers
   ```

Expected result:

```text
provider smoke: ok (ntfy_smoke)
```

## Bark

Bark does not require approval from PingBridge. You need the device key shown by the Bark iOS app.

1. Install/open Bark on iPhone.
2. In Bark, copy the test URL shown by the app.
3. The device key is the first path segment after the endpoint:

   ```text
   https://api.day.app/<device-key>/<message>
   ```

4. Put the key into `.env`:

   ```dotenv
   BARK_ENDPOINT=https://api.day.app
   BARK_DEVICE_KEY=<device-key>
   ```

5. Optional manual direct check:

   ```bash
   curl -X POST "https://api.day.app/$BARK_DEVICE_KEY/PingBridge%20Bark%20direct%20check"
   ```

6. Run PingBridge provider smoke:

   ```bash
   npm run build
   npm run test:providers
   ```

Expected result:

```text
provider smoke: ok (bark_smoke)
```

If both Bark and ntfy are configured, the expected result includes both channels:

```text
provider smoke: ok (bark_smoke, ntfy_smoke)
```

After both channels are configured once, future changes should reuse the same `.env` so test notifications keep arriving in the same Bark and ntfy places.

## Full Real Local Gate

After `.env` is filled:

```bash
npm run test:all:real
```

This runs the normal test gate and then the real provider smoke test. It will send real notifications if `.env` contains `PINGBRIDGE_RUN_PROVIDER_SMOKE=1`.

Docker smoke still requires Docker CLI and a running Docker daemon. Without Docker, it prints a skip message unless `PINGBRIDGE_REQUIRE_DOCKER=1` is set.

## Using Other Repositories for Real Tests

Once provider smoke passes, you can test another local open-source repository by calling PingBridge over HTTP or CLI.

Run PingBridge:

```bash
npm run dev:server
```

From another repository:

```bash
curl -X POST http://127.0.0.1:8787/v1/events \
  -H "Authorization: Bearer $PINGBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "other-open-source-repo",
    "eventType": "task.completed",
    "target": "me",
    "title": "Real integration test",
    "message": "This notification came from another repository.",
    "changed": true
  }'
```

Use this after Bark/ntfy smoke passes. Provider smoke tests the provider layer; cross-repo calls test the client/integration layer.

## References

- [ntfy getting started](https://docs.ntfy.sh/)
- [ntfy publishing](https://docs.ntfy.sh/publish/)
- [Bark project README](https://github.com/Finb/Bark)
- [Bark server API V2](https://github.com/Finb/bark-server/blob/master/docs/API_V2.md)
