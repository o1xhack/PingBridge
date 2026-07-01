# Integrating Other Projects

PingBridge is a backend notification service. Third-party apps should not integrate Bark, ntfy, or Telegram directly. They should call PingBridge with standard events.

## What The App Gets

After integration, an app can:

- check whether PingBridge is reachable
- preview routing without sending a notification
- send success, changed, failure, and auth-expired notifications
- rely on server-side provider routing
- avoid storing provider secrets

The app does not get a hosted cloud account, user management, or provider-specific SDKs.

## Current MVP Install Path

The client package is ready to publish, but it has not been published to npm yet.

Once published:

```bash
npm install @pingbridge/client
```

Before npm publish, use a local tarball from this repository:

```bash
cd /path/to/PingBridge
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

Recommended UI labels:

| Setting   | Description                                                     |
| --------- | --------------------------------------------------------------- |
| Enabled   | Turns PingBridge notifications on or off for the app.           |
| Endpoint  | URL of the PingBridge service, such as `http://127.0.0.1:8787`. |
| App token | Bearer token created by the PingBridge service operator.        |
| Target    | Stable recipient group, such as `me` or `ops`.                  |

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

If this fails, the endpoint is wrong, the service is down, or the network boundary is blocking the app.

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

If this fails, fix the token, target, payload shape, or service config before attempting a real notification.

If `preview.notify` is `false`, the event is valid but current routing would not send it. That is expected for many unchanged success events.

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

Use this only after `health` and `preview` pass.

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

## Minimal Drop-In Helper

This pattern keeps app code small and testable:

```ts
import { PingBridgeClient, PingBridgeClientError, type NotifyInput } from "@pingbridge/client";

export async function sendPingBridgeEvent(
  settings: PingBridgeSettings,
  event: Omit<NotifyInput, "target">
): Promise<void> {
  if (!settings.enabled) return;

  const ping = new PingBridgeClient({
    endpoint: settings.endpoint,
    token: settings.appToken
  });

  try {
    await ping.notify({ ...event, target: settings.target });
  } catch (error) {
    if (error instanceof PingBridgeClientError) {
      console.warn(`PingBridge failed: ${error.status} ${error.code}: ${error.message}`);
      return;
    }
    throw error;
  }
}
```

For settings screens, use `ping.health()` and `ping.preview(...)` for a "Test connection" button. Do not use `notify(...)` as the first test because it sends a real push.

## Event Naming

Prefer stable dotted event names:

| Scenario                        | Example                                |
| ------------------------------- | -------------------------------------- |
| Successful sync with changes    | `sync.completed` with `changed: true`  |
| Successful sync with no changes | `sync.completed` with `changed: false` |
| Failed sync                     | `sync.failed`                          |
| Expired OAuth token             | `auth.expired`                         |
| Background job completed        | `job.completed`                        |
| Background job failed           | `job.failed`                           |

Use `dedupeKey` for events that may retry or repeat. Good keys usually include the source, event type, and relevant date or object id.

## External Consumer Smoke Test

PingBridge includes a quiet external consumer test:

```bash
npm run test:external
```

This test creates a temporary outside project, installs the packed `@pingbridge/client` tarball, starts a local PingBridge HTTP server with fake provider delivery, calls `health`, `preview`, and `notify`, and verifies that preview does not send while notify does.

It proves the SDK can be installed and used by another project without relying on workspace imports.
