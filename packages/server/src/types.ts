export type ChannelType = "telegram" | "bark" | "ntfy";

export type Severity = "info" | "success" | "warning" | "error";

export type Priority = "low" | "normal" | "high";

export interface TelegramChannelConfig {
  type: "telegram";
  botToken: string;
  chatId: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}

export interface BarkChannelConfig {
  type: "bark";
  endpoint?: string;
  deviceKey: string;
}

export interface NtfyChannelConfig {
  type: "ntfy";
  server?: string;
  topic: string;
  token?: string;
}

export type ChannelConfig = TelegramChannelConfig | BarkChannelConfig | NtfyChannelConfig;

export interface TargetConfig {
  channels: string[];
}

export interface RuleMatch {
  source?: string;
  eventType?: string;
  target?: string;
  changed?: boolean;
  severity?: Severity;
}

export interface RuleConfig {
  match: RuleMatch;
  target?: string;
  priority?: Priority;
}

export interface ServerConfig {
  host?: string;
  port?: number;
  appToken?: string;
  databasePath?: string;
  dedupeWindowSeconds?: number;
  deliveryRetries?: number;
  deliveryRetryDelayMs?: number;
  requestTimeoutMs?: number;
}

export interface PingBridgeConfig {
  server?: ServerConfig;
  channels: Record<string, ChannelConfig>;
  targets: Record<string, TargetConfig>;
  rules?: RuleConfig[];
}

export interface NotifyEventInput {
  source: string;
  eventType: string;
  target: string;
  title: string;
  message: string;
  severity?: Severity;
  changed?: boolean;
  dedupeKey?: string;
  items?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface NormalizedEvent extends NotifyEventInput {
  severity: Severity;
  changed: boolean;
}

export type EventStatus = "accepted" | "delivered" | "partial_failure" | "failed" | "ignored" | "deduplicated";

export type DeliveryStatus = "queued" | "delivered" | "failed";

export type DeliveryResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; statusCode?: number; error: string };

export interface ProviderSendContext {
  channelId: string;
  eventId: string;
  priority: Priority;
  timeoutMs: number;
}

export interface NotificationProvider {
  send(channel: ChannelConfig, event: NormalizedEvent, context: ProviderSendContext): Promise<DeliveryResult>;
}

export type ProviderRegistry = Partial<Record<ChannelType, NotificationProvider>>;

export interface DeliverySummary {
  id: string;
  channel: string;
  channelType: ChannelType;
  status: DeliveryStatus;
  attempts: number;
  providerMessageId?: string;
  statusCode?: number;
  error?: string;
}

export interface NotifyResponse {
  eventId: string;
  status: EventStatus;
  deliveries: DeliverySummary[];
}

export interface EventPreviewResponse {
  status: "preview";
  notify: boolean;
  target: string;
  priority: Priority;
  channels: Array<{ id: string; type: ChannelType }>;
  dedupe: {
    key?: string;
    duplicate: boolean;
  };
}

export interface StoredEvent {
  id: string;
  createdAt: string;
  source: string;
  eventType: string;
  target: string;
  title: string;
  message: string;
  severity: Severity;
  changed: boolean;
  dedupeKey?: string;
  status: EventStatus;
  payload: NotifyEventInput;
}

export interface StoredDelivery extends DeliverySummary {
  eventId: string;
  createdAt: string;
  updatedAt: string;
}
