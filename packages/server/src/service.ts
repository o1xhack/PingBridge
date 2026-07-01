import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { PingBridgeStore, toDeliverySummary } from "./database.js";
import { createDefaultProviders } from "./providers.js";
import type {
  ChannelConfig,
  DeliveryResult,
  DeliveryStatus,
  DeliverySummary,
  EventStatus,
  NormalizedEvent,
  EventPreviewResponse,
  NotifyEventInput,
  NotifyResponse,
  PingBridgeConfig,
  Priority,
  ProviderRegistry,
  RuleConfig,
  Severity,
  StoredDelivery,
  StoredEvent
} from "./types.js";

export class PingBridgeError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

interface RouteDecision {
  notify: boolean;
  target: string;
  priority: Priority;
}

export class PingBridgeService {
  private readonly providers: ProviderRegistry;

  constructor(
    private readonly config: PingBridgeConfig,
    private readonly store: PingBridgeStore,
    providers: ProviderRegistry = createDefaultProviders()
  ) {
    this.providers = providers;
  }

  async notify(input: unknown): Promise<NotifyResponse> {
    const event = normalizeEventInput(input);
    const route = this.resolveRoute(event);

    if (route.notify) {
      this.assertTarget(route.target);
    }

    const eventId = createId("evt");
    const createdAt = new Date().toISOString();

    if (route.notify && event.dedupeKey && this.isDuplicate(event.dedupeKey)) {
      this.store.insertEvent({ id: eventId, createdAt, input: event, status: "deduplicated" });
      return { eventId, status: "deduplicated", deliveries: [] };
    }

    if (!route.notify) {
      this.store.insertEvent({ id: eventId, createdAt, input: event, status: "ignored" });
      return { eventId, status: "ignored", deliveries: [] };
    }

    this.store.insertEvent({ id: eventId, createdAt, input: event, status: "accepted" });
    const deliveries = await this.deliverToTarget(eventId, event, route.target, route.priority);
    const finalStatus = summarizeEventStatus(deliveries);
    this.store.updateEventStatus(eventId, finalStatus);

    return { eventId, status: finalStatus, deliveries };
  }

  preview(input: unknown): EventPreviewResponse {
    const event = normalizeEventInput(input);
    const route = this.resolveRoute(event);

    if (!route.notify) {
      return {
        status: "preview",
        notify: false,
        target: route.target,
        priority: route.priority,
        channels: [],
        dedupe: {
          key: event.dedupeKey,
          duplicate: false
        }
      };
    }

    this.assertTarget(route.target);
    return {
      status: "preview",
      notify: true,
      target: route.target,
      priority: route.priority,
      channels: this.config.targets[route.target].channels.map((channelId) => ({
        id: channelId,
        type: this.config.channels[channelId].type
      })),
      dedupe: {
        key: event.dedupeKey,
        duplicate: event.dedupeKey ? this.isDuplicate(event.dedupeKey) : false
      }
    };
  }

  async testChannel(channelId: string): Promise<NotifyResponse> {
    const channel = this.config.channels[channelId];
    if (!channel) {
      throw new PingBridgeError(404, "channel_not_found", `Unknown channel "${channelId}".`);
    }

    const event: NormalizedEvent = {
      source: "pingbridge",
      eventType: "channel.test",
      target: channelId,
      title: "PingBridge test notification",
      message: `Test notification for channel "${channelId}".`,
      severity: "info",
      changed: true
    };
    const eventId = createId("evt");
    const createdAt = new Date().toISOString();
    this.store.insertEvent({ id: eventId, createdAt, input: event, status: "accepted" });
    const delivery = await this.deliverToChannel(eventId, event, channelId, channel, "normal");
    const status = summarizeEventStatus([delivery]);
    this.store.updateEventStatus(eventId, status);
    return { eventId, status, deliveries: [delivery] };
  }

  listRecentEvents(limit?: number): StoredEvent[] {
    return this.store.listRecentEvents(limit);
  }

  listFailedDeliveries(limit?: number): StoredDelivery[] {
    return this.store.listFailedDeliveries(limit);
  }

  getDeliveryStatus(id: string): StoredDelivery {
    const delivery = this.store.getDelivery(id);
    if (!delivery) {
      throw new PingBridgeError(404, "delivery_not_found", `Unknown delivery "${id}".`);
    }
    return delivery;
  }

  listChannels(): Array<{ id: string; type: ChannelConfig["type"] }> {
    return Object.entries(this.config.channels).map(([id, channel]) => ({ id, type: channel.type }));
  }

  private async deliverToTarget(
    eventId: string,
    event: NormalizedEvent,
    targetId: string,
    priority: Priority
  ): Promise<DeliverySummary[]> {
    const target = this.config.targets[targetId];
    return Promise.all(
      target.channels.map((channelId) => {
        const channel = this.config.channels[channelId];
        return this.deliverToChannel(eventId, event, channelId, channel, priority);
      })
    );
  }

  private async deliverToChannel(
    eventId: string,
    event: NormalizedEvent,
    channelId: string,
    channel: ChannelConfig,
    priority: Priority
  ): Promise<DeliverySummary> {
    const deliveryId = createId("dlv");
    const createdAt = new Date().toISOString();
    this.store.insertDelivery({ id: deliveryId, eventId, channelId, channelType: channel.type, createdAt });

    const result = await this.sendWithRetry(channel, event, {
      channelId,
      eventId,
      deliveryId,
      priority
    });
    const status: DeliveryStatus = result.result.ok ? "delivered" : "failed";
    const updatedAt = new Date().toISOString();
    this.store.updateDelivery({
      id: deliveryId,
      status,
      attempts: result.attempts,
      providerMessageId: result.result.ok ? result.result.providerMessageId : undefined,
      statusCode: result.result.ok ? undefined : result.result.statusCode,
      error: result.result.ok ? undefined : result.result.error,
      updatedAt
    });

    const stored = this.store.getDelivery(deliveryId);
    if (!stored) {
      throw new PingBridgeError(500, "delivery_missing", `Delivery "${deliveryId}" was not persisted.`);
    }
    return toDeliverySummary(stored);
  }

  private async sendWithRetry(
    channel: ChannelConfig,
    event: NormalizedEvent,
    context: { channelId: string; eventId: string; deliveryId: string; priority: Priority }
  ): Promise<{ attempts: number; result: DeliveryResult }> {
    const provider = this.providers[channel.type];
    if (!provider) {
      return { attempts: 1, result: { ok: false, error: `No provider registered for "${channel.type}".` } };
    }

    const retries = this.config.server?.deliveryRetries ?? 3;
    const delayMs = this.config.server?.deliveryRetryDelayMs ?? 250;
    const timeoutMs = this.config.server?.requestTimeoutMs ?? 10000;
    let lastResult: DeliveryResult = { ok: false, error: "Provider was not called." };

    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      try {
        lastResult = await provider.send(channel, event, {
          channelId: context.channelId,
          eventId: context.eventId,
          priority: context.priority,
          timeoutMs
        });
      } catch (error) {
        lastResult = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }

      if (lastResult.ok || attempt > retries) {
        return { attempts: attempt, result: lastResult };
      }

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }

    return { attempts: retries + 1, result: lastResult };
  }

  private resolveRoute(event: NormalizedEvent): RouteDecision {
    const rule = (this.config.rules ?? []).find((candidate) => matchesRule(candidate, event));
    if (rule) {
      return {
        notify: true,
        target: rule.target ?? event.target,
        priority: rule.priority ?? defaultPriority(event)
      };
    }

    if (shouldNotifyByDefault(event)) {
      return { notify: true, target: event.target, priority: defaultPriority(event) };
    }

    return { notify: false, target: event.target, priority: "normal" };
  }

  private assertTarget(targetId: string): void {
    if (!this.config.targets[targetId]) {
      throw new PingBridgeError(400, "unknown_target", `Unknown target "${targetId}".`);
    }
  }

  private isDuplicate(dedupeKey: string): boolean {
    const windowSeconds = this.config.server?.dedupeWindowSeconds ?? 3600;
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    return this.store.hasRecentDedupeKey(dedupeKey, since);
  }
}

export function normalizeEventInput(input: unknown): NormalizedEvent {
  if (!input || typeof input !== "object") {
    throw new PingBridgeError(400, "invalid_event", "Request body must be a JSON object.");
  }

  const record = input as Record<string, unknown>;
  const severity = (record.severity ?? "info") as Severity;

  if (!["info", "success", "warning", "error"].includes(severity)) {
    throw new PingBridgeError(400, "invalid_severity", "severity must be one of info, success, warning, error.");
  }

  return {
    source: requireNonEmptyString(record, "source"),
    eventType: requireNonEmptyString(record, "eventType"),
    target: requireNonEmptyString(record, "target"),
    title: requireNonEmptyString(record, "title"),
    message: requireNonEmptyString(record, "message"),
    severity,
    changed: parseBoolean(record.changed, false),
    dedupeKey: optionalString(record.dedupeKey, "dedupeKey"),
    items: Array.isArray(record.items) ? record.items : undefined,
    metadata: isObjectRecord(record.metadata) ? record.metadata : undefined
  };
}

function matchesRule(rule: RuleConfig, event: NormalizedEvent): boolean {
  const match = rule.match ?? {};
  if (match.source !== undefined && match.source !== event.source) return false;
  if (match.eventType !== undefined && match.eventType !== event.eventType) return false;
  if (match.target !== undefined && match.target !== event.target) return false;
  if (match.changed !== undefined && match.changed !== event.changed) return false;
  if (match.severity !== undefined && match.severity !== event.severity) return false;
  return true;
}

function shouldNotifyByDefault(event: NormalizedEvent): boolean {
  const eventType = event.eventType.toLowerCase();
  return event.severity === "error" || eventType.endsWith(".failed") || eventType === "auth.expired" || event.changed;
}

function defaultPriority(event: NormalizedEvent): Priority {
  return event.severity === "error" || event.eventType === "auth.expired" || event.eventType.endsWith(".failed")
    ? "high"
    : "normal";
}

function summarizeEventStatus(deliveries: DeliverySummary[]): EventStatus {
  if (deliveries.every((delivery) => delivery.status === "delivered")) {
    return "delivered";
  }
  if (deliveries.every((delivery) => delivery.status === "failed")) {
    return "failed";
  }
  return "partial_failure";
}

function requireNonEmptyString(record: Record<string, unknown>, field: keyof NotifyEventInput): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new PingBridgeError(400, "invalid_event", `${String(field)} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new PingBridgeError(400, "invalid_event", `${field} must be a non-empty string when provided.`);
  }
  return value;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw new PingBridgeError(400, "invalid_event", "changed must be a boolean when provided.");
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
}
