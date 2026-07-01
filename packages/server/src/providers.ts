import type {
  BarkChannelConfig,
  ChannelConfig,
  DeliveryResult,
  NormalizedEvent,
  NotificationProvider,
  NtfyChannelConfig,
  Priority,
  ProviderRegistry,
  ProviderSendContext,
  TelegramChannelConfig
} from "./types.js";

export class TelegramProvider implements NotificationProvider {
  async send(channel: ChannelConfig, event: NormalizedEvent, context: ProviderSendContext): Promise<DeliveryResult> {
    const telegram = channel as TelegramChannelConfig;
    const response = await fetchWithTimeout(
      `https://api.telegram.org/bot${telegram.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegram.chatId,
          text: formatMessage(event),
          parse_mode: telegram.parseMode,
          disable_web_page_preview: true
        })
      },
      context.timeoutMs
    );

    if (!response.ok) {
      return { ok: false, statusCode: response.status, error: await safeResponseText(response) };
    }

    const json = (await response.json().catch(() => undefined)) as { result?: { message_id?: number } } | undefined;
    return { ok: true, providerMessageId: json?.result?.message_id?.toString() };
  }
}

export class BarkProvider implements NotificationProvider {
  async send(channel: ChannelConfig, event: NormalizedEvent, context: ProviderSendContext): Promise<DeliveryResult> {
    const bark = channel as BarkChannelConfig;
    const endpoint = trimTrailingSlash(bark.endpoint ?? "https://api.day.app");
    const query = buildBarkQuery(event, context.priority);
    const url = `${endpoint}/${encodeURIComponent(bark.deviceKey)}/${encodeURIComponent(event.title)}/${encodeURIComponent(
      event.message
    )}${query}`;
    const response = await fetchWithTimeout(url, { method: "POST" }, context.timeoutMs);

    if (!response.ok) {
      return { ok: false, statusCode: response.status, error: await safeResponseText(response) };
    }

    return { ok: true };
  }
}

export class NtfyProvider implements NotificationProvider {
  async send(channel: ChannelConfig, event: NormalizedEvent, context: ProviderSendContext): Promise<DeliveryResult> {
    const ntfy = channel as NtfyChannelConfig;
    const server = trimTrailingSlash(ntfy.server ?? "https://ntfy.sh");
    const headers: Record<string, string> = {
      Title: event.title,
      Priority: mapNtfyPriority(context.priority),
      Tags: mapTags(event)
    };
    if (event.presentation?.url) {
      headers.Click = event.presentation.url;
    }
    if (event.presentation?.iconUrl) {
      headers.Icon = event.presentation.iconUrl;
    }
    if (ntfy.token) {
      headers.Authorization = `Bearer ${ntfy.token}`;
    }

    const response = await fetchWithTimeout(
      `${server}/${encodeURIComponent(ntfy.topic)}`,
      {
        method: "POST",
        headers,
        body: event.message
      },
      context.timeoutMs
    );

    if (!response.ok) {
      return { ok: false, statusCode: response.status, error: await safeResponseText(response) };
    }

    const json = (await response.json().catch(() => undefined)) as { id?: string } | undefined;
    return { ok: true, providerMessageId: json?.id };
  }
}

export function createDefaultProviders(): ProviderRegistry {
  return {
    telegram: new TelegramProvider(),
    bark: new BarkProvider(),
    ntfy: new NtfyProvider()
  };
}

export function formatMessage(event: NormalizedEvent): string {
  const detailLines = [
    ...(event.presentation?.appName ? [`App: ${event.presentation.appName}`] : []),
    `Source: ${event.source}`,
    `Event: ${event.eventType}`,
    ...(event.presentation?.url ? [`URL: ${event.presentation.url}`] : [])
  ];
  return `${event.title}\n\n${event.message}\n\n${detailLines.join("\n")}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function safeResponseText(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text || response.statusText || "Provider request failed.";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildBarkQuery(event: NormalizedEvent, priority: Priority): string {
  const params = new URLSearchParams();
  if (priority === "high") {
    params.set("level", "critical");
  } else if (priority === "low") {
    params.set("level", "passive");
  }

  if (event.presentation?.iconUrl) {
    params.set("icon", event.presentation.iconUrl);
  }
  if (event.presentation?.group) {
    params.set("group", event.presentation.group);
  }
  if (event.presentation?.url) {
    params.set("url", event.presentation.url);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function mapNtfyPriority(priority: Priority): string {
  if (priority === "high") {
    return "high";
  }
  if (priority === "low") {
    return "low";
  }
  return "default";
}

function mapTags(event: NormalizedEvent): string {
  if (event.presentation?.tags?.length) {
    return event.presentation.tags.join(",");
  }
  if (event.severity === "error") {
    return "warning";
  }
  if (event.changed) {
    return "bell";
  }
  return "information_source";
}
