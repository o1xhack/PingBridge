# Integrating Other Projects

PingBridge is a backend notification service. Third-party apps should not integrate Bark, ntfy, or Telegram directly. They should call PingBridge with standard events.

## Current MVP Install Path

The client package is ready to publish, but it has not been published to npm yet.

Once published:

```bash
npm install @pingbridge/client
```

Before npm publish, use a local tarball from this repository:

```bash
cd /Users/yuxiao/Documents/working/baas/PingBridge
npm run build
npm pack --workspace @pingbridge/client --pack-destination /tmp
```

Then in another project:

```bash
npm install /tmp/pingbridge-client-0.1.0.tgz
```

The import path is the same either way:

```ts
import { PingBridgeClient } from "@pingbridge/client";
```

## App Configuration

An app or plugin should store only PingBridge service settings:

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
}
```

It should not store Bark device keys, ntfy topics, or Telegram bot tokens.

## Three-Step Integration Test

Use this order in third-party projects.

### 1. Health Check

Checks that the service is reachable. This does not send a notification.

```ts
const ping = new PingBridgeClient({
  endpoint: settings.endpoint,
  token: settings.appToken
});

await ping.health();
```

CLI equivalent:

```bash
pingbridge health --endpoint "$PINGBRIDGE_ENDPOINT" --token "$PINGBRIDGE_TOKEN"
```

### 2. Preview

Checks payload shape, token, target, routing, priority, and dedupe state. This does not send a notification.

```ts
const preview = await ping.preview({
  source: "obsidian-sync-trakt",
  eventType: "sync.completed",
  target: settings.target,
  title: "Trakt sync completed",
  message: "Wrote 3 Daily Notes.",
  changed: true,
  dedupeKey: "obsidian-sync-trakt:daily-notes"
});

console.log(preview.channels);
```

CLI equivalent:

```bash
pingbridge preview \
  --endpoint "$PINGBRIDGE_ENDPOINT" \
  --token "$PINGBRIDGE_TOKEN" \
  --source obsidian-sync-trakt \
  --event sync.completed \
  --target me \
  --title "Trakt sync completed" \
  --message "Wrote 3 Daily Notes." \
  --changed true
```

### 3. Notify

Sends a real notification if routing says it should notify.

```ts
await ping.notify({
  source: "obsidian-sync-trakt",
  eventType: "sync.completed",
  target: settings.target,
  title: "Trakt sync completed",
  message: "Wrote 3 Daily Notes.",
  changed: true,
  dedupeKey: "obsidian-sync-trakt:daily-notes"
});
```

CLI equivalent:

```bash
pingbridge notify \
  --endpoint "$PINGBRIDGE_ENDPOINT" \
  --token "$PINGBRIDGE_TOKEN" \
  --source obsidian-sync-trakt \
  --event sync.completed \
  --target me \
  --title "Trakt sync completed" \
  --message "Wrote 3 Daily Notes." \
  --changed true
```

## Failure and Auth Expired Helpers

```ts
await ping.failed({
  source: "obsidian-sync-trakt",
  eventType: "sync.failed",
  target: settings.target,
  title: "Trakt sync failed",
  message: "OAuth invalid_grant"
});

await ping.authExpired({
  source: "obsidian-sync-trakt",
  target: settings.target,
  title: "Trakt authorization expired",
  message: "Reconnect Trakt before the next sync."
});
```

## External Consumer Smoke Test

PingBridge includes a quiet external consumer test:

```bash
npm run test:external
```

This test creates a temporary outside project, installs the packed `@pingbridge/client` tarball, starts a local PingBridge HTTP server with fake provider delivery, calls `health`, `preview`, and `notify`, and verifies that preview does not send while notify does.

It proves the SDK can be installed and used by another project without relying on workspace imports.
