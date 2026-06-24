import { createPingBridgeRuntime } from "../packages/server/dist/index.js";

if (process.env.PINGBRIDGE_RUN_PROVIDER_SMOKE !== "1") {
  console.log("provider smoke: skipped (set PINGBRIDGE_RUN_PROVIDER_SMOKE=1 to send real notifications)");
  process.exit(0);
}

const channels = {};
const targets = { smoke: { channels: [] } };

if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  channels.telegram_smoke = {
    type: "telegram",
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  };
  targets.smoke.channels.push("telegram_smoke");
}

if (process.env.BARK_DEVICE_KEY) {
  channels.bark_smoke = {
    type: "bark",
    endpoint: process.env.BARK_ENDPOINT || "https://api.day.app",
    deviceKey: process.env.BARK_DEVICE_KEY
  };
  targets.smoke.channels.push("bark_smoke");
}

if (process.env.NTFY_TOPIC) {
  channels.ntfy_smoke = {
    type: "ntfy",
    server: process.env.NTFY_SERVER || "https://ntfy.sh",
    topic: process.env.NTFY_TOPIC,
    token: process.env.NTFY_TOKEN || undefined
  };
  targets.smoke.channels.push("ntfy_smoke");
}

if (targets.smoke.channels.length === 0) {
  console.log("provider smoke: skipped (no provider credentials configured)");
  process.exit(0);
}

const runtime = createPingBridgeRuntime({
  server: {
    databasePath: ":memory:",
    deliveryRetries: 1,
    deliveryRetryDelayMs: 250,
    requestTimeoutMs: 10000
  },
  channels,
  targets
});

try {
  const response = await runtime.service.notify({
    source: "pingbridge-provider-smoke",
    eventType: "test.notification",
    target: "smoke",
    title: "PingBridge provider smoke",
    message: `Provider smoke test at ${new Date().toISOString()}`,
    changed: true,
    dedupeKey: `provider-smoke:${Date.now()}`
  });

  const failed = response.deliveries.filter((delivery) => delivery.status !== "delivered");
  if (failed.length > 0) {
    console.error(JSON.stringify(response, null, 2));
    throw new Error(`provider smoke failed for ${failed.map((delivery) => delivery.channel).join(", ")}`);
  }

  console.log(`provider smoke: ok (${response.deliveries.map((delivery) => delivery.channel).join(", ")})`);
} finally {
  runtime.store.close();
}
