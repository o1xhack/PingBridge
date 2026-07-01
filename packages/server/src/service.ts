import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { normalizeConfig } from "./config.js";
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
  NotificationAppConfig,
  NotificationGroupConfig,
  NotificationPresentation,
  NotifyResponse,
  PingBridgeConfig,
  PortableNotificationConfig,
  PortableConfigHealthResponse,
  PortablePreviewResponse,
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

interface PortableNormalizedInput {
  app: NotificationAppConfig;
  group: string;
  event: NormalizedEvent;
  config: PingBridgeConfig;
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
    return this.notifyNormalized(event, this.config);
  }

  async notifyWithConfig(input: unknown): Promise<NotifyResponse> {
    const portable = normalizePortableNotificationInput(input, this.config.server);
    return this.notifyNormalized(portable.event, portable.config);
  }

  private async notifyNormalized(event: NormalizedEvent, config: PingBridgeConfig): Promise<NotifyResponse> {
    const route = this.resolveRoute(event, config);

    if (route.notify) {
      this.assertTarget(route.target, config);
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
    const deliveries = await this.deliverToTarget(eventId, event, route.target, route.priority, config);
    const finalStatus = summarizeEventStatus(deliveries);
    this.store.updateEventStatus(eventId, finalStatus);

    return { eventId, status: finalStatus, deliveries };
  }

  preview(input: unknown): EventPreviewResponse {
    const event = normalizeEventInput(input);
    return this.previewNormalized(event, this.config);
  }

  previewWithConfig(input: unknown): PortablePreviewResponse {
    const portable = normalizePortableNotificationInput(input, this.config.server);
    return {
      ...this.previewNormalized(portable.event, portable.config),
      app: {
        id: portable.app.id,
        name: portable.app.name,
        iconUrl: portable.app.iconUrl
      },
      group: portable.group
    };
  }

  checkConfig(input: unknown): PortableConfigHealthResponse {
    const portable = normalizePortableConfig(readPortableConfigInput(input), this.config.server).portable;
    const channels = Object.entries(portable.channels).map(([id, channel]) => ({
      id,
      type: channel.type,
      supported: Boolean(this.providers[channel.type])
    }));
    const warnings = channels
      .filter((channel) => !channel.supported)
      .map((channel) => `No provider registered for channel "${channel.id}" (${channel.type}).`);

    return {
      status: warnings.length === 0 ? "ok" : "warning",
      app: {
        id: portable.app.id,
        name: portable.app.name,
        iconUrl: portable.app.iconUrl
      },
      groups: Object.entries(portable.groups ?? {}).map(([id, group]) => ({
        id,
        label: group.label,
        iconUrl: group.iconUrl,
        channels: group.channels.map((channelId) => {
          const channel = portable.channels[channelId];
          return {
            id: channelId,
            type: channel.type,
            supported: Boolean(this.providers[channel.type])
          };
        })
      })),
      channels,
      warnings
    };
  }

  private previewNormalized(event: NormalizedEvent, config: PingBridgeConfig): EventPreviewResponse {
    const route = this.resolveRoute(event, config);

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

    this.assertTarget(route.target, config);
    return {
      status: "preview",
      notify: true,
      target: route.target,
      priority: route.priority,
      channels: config.targets[route.target].channels.map((channelId) => ({
        id: channelId,
        type: config.channels[channelId].type
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
    priority: Priority,
    config: PingBridgeConfig
  ): Promise<DeliverySummary[]> {
    const target = config.targets[targetId];
    return Promise.all(
      target.channels.map((channelId) => {
        const channel = config.channels[channelId];
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

  private resolveRoute(event: NormalizedEvent, config: PingBridgeConfig): RouteDecision {
    const rule = (config.rules ?? []).find((candidate) => matchesRule(candidate, event));
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

  private assertTarget(targetId: string, config: PingBridgeConfig): void {
    if (!config.targets[targetId]) {
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
    metadata: isObjectRecord(record.metadata) ? record.metadata : undefined,
    presentation: normalizePresentation(record.presentation)
  };
}

export function normalizePortableNotificationInput(
  input: unknown,
  serverConfig: PingBridgeConfig["server"] = {}
): PortableNormalizedInput {
  if (!isObjectRecord(input)) {
    throw new PingBridgeError(400, "invalid_portable_message", "Request body must be a JSON object.");
  }

  const config = normalizePortableConfig(input.config, serverConfig);
  const message = requireObject(input.message, "message");
  const group = chooseGroup(config.portable, message);
  const groupConfig = config.portable.groups?.[group];

  const event = normalizeEventInput({
    source: config.portable.app.id,
    eventType: requireNonEmptyString(message, "eventType"),
    target: group,
    title: requireNonEmptyString(message, "title"),
    message: requireNonEmptyString(message, "message"),
    severity: message.severity ?? config.portable.defaults?.severity ?? "info",
    changed: message.changed ?? config.portable.defaults?.changed ?? false,
    dedupeKey: message.dedupeKey,
    items: message.items,
    metadata: message.metadata,
    presentation: mergePresentation(
      {
        appName: config.portable.app.name,
        iconUrl: groupConfig?.iconUrl ?? config.portable.app.iconUrl,
        group: groupConfig?.label ?? group
      },
      normalizePresentation(message.presentation)
    )
  });

  return { app: config.portable.app, group, event, config: config.runtime };
}

function readPortableConfigInput(input: unknown): unknown {
  if (isObjectRecord(input) && "config" in input) {
    return input.config;
  }
  return input;
}

function normalizePortableConfig(
  input: unknown,
  serverConfig: PingBridgeConfig["server"]
): { portable: PortableNotificationConfig; runtime: PingBridgeConfig } {
  const record = requireObject(input, "config");
  const appRecord = requireObject(record.app, "config.app");
  const app: NotificationAppConfig = {
    id: requireNonEmptyString(appRecord, "id"),
    name: requireNonEmptyString(appRecord, "name"),
    iconUrl: optionalString(appRecord.iconUrl, "config.app.iconUrl"),
    defaultGroup: optionalString(appRecord.defaultGroup, "config.app.defaultGroup")
  };

  const channels = requireRecord(record.channels, "config.channels") as Record<string, ChannelConfig>;
  const groups = normalizePortableGroups(record.groups, channels);
  const defaults = isObjectRecord(record.defaults)
    ? {
        group: optionalString(record.defaults.group, "config.defaults.group"),
        severity: normalizeOptionalSeverity(record.defaults.severity, "config.defaults.severity"),
        changed: parseBoolean(record.defaults.changed, false)
      }
    : undefined;

  if (app.defaultGroup && !groups[app.defaultGroup]) {
    throw new PingBridgeError(400, "invalid_config", `config.app.defaultGroup "${app.defaultGroup}" is not defined.`);
  }
  if (defaults?.group && !groups[defaults.group]) {
    throw new PingBridgeError(400, "invalid_config", `config.defaults.group "${defaults.group}" is not defined.`);
  }

  const portable: PortableNotificationConfig = {
    app,
    channels,
    groups,
    defaults,
    rules: Array.isArray(record.rules) ? (record.rules as RuleConfig[]) : []
  };

  try {
    const runtime = normalizeConfig({
      server: serverConfig,
      channels,
      targets: groups,
      rules: portable.rules
    });
    return { portable, runtime };
  } catch (error) {
    throw new PingBridgeError(400, "invalid_config", error instanceof Error ? error.message : String(error));
  }
}

function normalizePortableGroups(
  input: unknown,
  channels: Record<string, ChannelConfig>
): Record<string, NotificationGroupConfig> {
  if (input === undefined || input === null) {
    return { default: { channels: Object.keys(channels) } };
  }

  const groups = requireRecord(input, "config.groups");
  const normalized: Record<string, NotificationGroupConfig> = {};
  for (const [id, group] of Object.entries(groups)) {
    if (!isObjectRecord(group)) {
      throw new PingBridgeError(400, "invalid_config", `Group "${id}" must be an object.`);
    }
    if (!Array.isArray(group.channels) || group.channels.length === 0) {
      throw new PingBridgeError(400, "invalid_config", `Group "${id}" must list at least one channel.`);
    }
    for (const channelId of group.channels) {
      if (typeof channelId !== "string" || !channels[channelId]) {
        throw new PingBridgeError(400, "invalid_config", `Group "${id}" references unknown channel "${channelId}".`);
      }
    }
    normalized[id] = {
      channels: [...group.channels],
      label: optionalString(group.label, `config.groups.${id}.label`),
      iconUrl: optionalString(group.iconUrl, `config.groups.${id}.iconUrl`)
    };
  }
  return normalized;
}

function chooseGroup(config: PortableNotificationConfig, message: Record<string, unknown>): string {
  const group =
    optionalString(message.group, "message.group") ??
    config.defaults?.group ??
    config.app.defaultGroup ??
    (config.groups?.default ? "default" : Object.keys(config.groups ?? {})[0]);
  if (!group || !config.groups?.[group]) {
    throw new PingBridgeError(400, "unknown_group", `Unknown notification group "${group ?? ""}".`);
  }
  return group;
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

function requireNonEmptyString(record: Record<string, unknown>, field: string): string {
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

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!isObjectRecord(value)) {
    throw new PingBridgeError(400, "invalid_config", `${field} must be an object.`);
  }
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  const record = requireObject(value, field);
  if (Object.keys(record).length === 0) {
    throw new PingBridgeError(400, "invalid_config", `${field} must not be empty.`);
  }
  return record;
}

function normalizeOptionalSeverity(value: unknown, field: string): Severity | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string" && ["info", "success", "warning", "error"].includes(value)) {
    return value as Severity;
  }
  throw new PingBridgeError(400, "invalid_config", `${field} must be one of info, success, warning, error.`);
}

function normalizePresentation(value: unknown): NotificationPresentation | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const record = requireObject(value, "presentation");
  const presentation: NotificationPresentation = {
    appName: optionalString(record.appName, "presentation.appName"),
    iconUrl: optionalString(record.iconUrl, "presentation.iconUrl"),
    group: optionalString(record.group, "presentation.group"),
    url: optionalString(record.url, "presentation.url"),
    tags: Array.isArray(record.tags)
      ? record.tags.map((tag) => {
          if (typeof tag !== "string" || tag.trim() === "") {
            throw new PingBridgeError(400, "invalid_event", "presentation.tags must contain non-empty strings.");
          }
          return tag;
        })
      : undefined
  };

  return Object.values(presentation).some((entry) => entry !== undefined) ? presentation : undefined;
}

function mergePresentation(
  defaults: NotificationPresentation,
  override: NotificationPresentation | undefined
): NotificationPresentation {
  return {
    ...defaults,
    ...override,
    tags: override?.tags ?? defaults.tags
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
}
