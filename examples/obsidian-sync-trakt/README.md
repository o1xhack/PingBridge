# Obsidian Sync Trakt Example

This example shows the intended integration style for an Obsidian plugin. The plugin sends standard PingBridge events and does not know about Telegram, Bark, or ntfy credentials.

```ts
import { PingBridgeClient } from "@o1x/pingbridge-client";

interface PingBridgeSettings {
  enabled: boolean;
  endpoint: string;
  appToken: string;
  target: string;
  notifyOnChanged: boolean;
  notifyOnFailure: boolean;
  notifyOnAuthExpired: boolean;
}

export async function notifySyncCompleted(settings: PingBridgeSettings, changed: boolean, writtenCount: number) {
  if (!settings.enabled) return;

  const ping = new PingBridgeClient({
    endpoint: settings.endpoint,
    token: settings.appToken
  });

  await ping.notify({
    source: "obsidian-sync-trakt",
    eventType: "sync.completed",
    target: settings.target,
    title: "Trakt sync completed",
    message: changed ? `Wrote ${writtenCount} Daily Notes.` : "No changes.",
    changed,
    dedupeKey: `obsidian-sync-trakt:${new Date().toISOString().slice(0, 10)}:daily-notes`
  });
}
```
