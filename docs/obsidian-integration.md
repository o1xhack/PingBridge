# Obsidian Integration

Obsidian plugins should depend only on the PingBridge TypeScript client. Bark, ntfy, and Telegram secrets stay on the PingBridge server.

## Settings

```ts
interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
  notifyOnChanged: boolean;
  notifyOnFailure: boolean;
  notifyOnAuthExpired: boolean;
}
```

## Client Setup

```ts
import { PingBridgeClient } from "@pingbridge/client";

const ping = new PingBridgeClient({
  endpoint: settings.endpoint,
  token: settings.appToken
});
```

## Connection Test

Use `health` and `preview` from the plugin settings screen before sending real notifications:

```ts
await ping.health();

await ping.preview({
  source: "obsidian-sync-trakt",
  eventType: "sync.completed",
  target: settings.target,
  title: "PingBridge preview",
  message: "This validates routing without sending a notification.",
  changed: true
});
```

## Sync Completed With Changes

```ts
if (settings.enabled && settings.notifyOnChanged && changed) {
  await ping.changed({
    source: "obsidian-sync-trakt",
    eventType: "sync.completed",
    target: settings.target,
    title: "Trakt sync completed",
    message: "Wrote 3 Daily Notes.",
    dedupeKey: `obsidian-sync-trakt:${date}:daily-notes`
  });
}
```

## Sync Completed Without Changes

You can skip sending this event, or send it with `changed: false` if you want PingBridge to keep an audit record without pushing:

```ts
await ping.notify({
  source: "obsidian-sync-trakt",
  eventType: "sync.completed",
  target: settings.target,
  title: "Trakt sync completed",
  message: "No changes.",
  changed: false
});
```

## Failure

```ts
if (settings.enabled && settings.notifyOnFailure) {
  await ping.failed({
    source: "obsidian-sync-trakt",
    eventType: "sync.failed",
    target: settings.target,
    title: "Trakt sync failed",
    message: error instanceof Error ? error.message : String(error),
    dedupeKey: `obsidian-sync-trakt:${date}:failure`
  });
}
```

## Auth Expired

```ts
if (settings.enabled && settings.notifyOnAuthExpired) {
  await ping.authExpired({
    source: "obsidian-sync-trakt",
    target: settings.target,
    title: "Trakt authorization expired",
    message: "Reconnect Trakt before the next sync."
  });
}
```
