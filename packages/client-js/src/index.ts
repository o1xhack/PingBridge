export type Severity = "info" | "success" | "warning" | "error";

export interface NotifyInput {
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

export interface DeliverySummary {
  id: string;
  channel: string;
  channelType: "telegram" | "bark" | "ntfy";
  status: "queued" | "delivered" | "failed";
  attempts: number;
  providerMessageId?: string;
  statusCode?: number;
  error?: string;
}

export interface NotifyResponse {
  eventId: string;
  status: "accepted" | "delivered" | "partial_failure" | "failed" | "ignored" | "deduplicated";
  deliveries: DeliverySummary[];
}

export interface EventPreviewResponse {
  status: "preview";
  notify: boolean;
  target: string;
  priority: "low" | "normal" | "high";
  channels: Array<{ id: string; type: "telegram" | "bark" | "ntfy" }>;
  dedupe: {
    key?: string;
    duplicate: boolean;
  };
}

export interface PingBridgeClientOptions {
  endpoint: string;
  token?: string;
  fetch?: typeof fetch;
}

export interface RecentEventsResponse {
  events: unknown[];
}

export interface FailedDeliveriesResponse {
  deliveries: DeliverySummary[];
}

export interface ChannelsResponse {
  channels: Array<{ id: string; type: "telegram" | "bark" | "ntfy" }>;
}

export interface HealthResponse {
  status: "ok";
}

export class PingBridgeClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export class PingBridgeClient {
  private readonly endpoint: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PingBridgeClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
  }

  notify(input: NotifyInput): Promise<NotifyResponse> {
    return this.request<NotifyResponse>("/v1/events", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/v1/health", { method: "GET" });
  }

  preview(input: NotifyInput): Promise<EventPreviewResponse> {
    return this.request<EventPreviewResponse>("/v1/events/preview", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  changed(input: Omit<NotifyInput, "changed">): Promise<NotifyResponse> {
    return this.notify({ ...input, changed: true });
  }

  failed(input: Omit<NotifyInput, "changed" | "severity">): Promise<NotifyResponse> {
    return this.notify({ ...input, changed: true, severity: "error" });
  }

  authExpired(input: Omit<NotifyInput, "eventType" | "changed" | "severity">): Promise<NotifyResponse> {
    return this.notify({ ...input, eventType: "auth.expired", changed: true, severity: "error" });
  }

  test(channelId: string): Promise<NotifyResponse> {
    return this.request<NotifyResponse>(`/v1/channels/${encodeURIComponent(channelId)}/test`, { method: "POST" });
  }

  recent(limit = 20): Promise<RecentEventsResponse> {
    return this.request<RecentEventsResponse>(`/v1/events/recent?limit=${encodeURIComponent(limit)}`, {
      method: "GET"
    });
  }

  failedDeliveries(limit = 20): Promise<FailedDeliveriesResponse> {
    return this.request<FailedDeliveriesResponse>(`/v1/deliveries/failed?limit=${encodeURIComponent(limit)}`, {
      method: "GET"
    });
  }

  listChannels(): Promise<ChannelsResponse> {
    return this.request<ChannelsResponse>("/v1/channels", { method: "GET" });
  }

  getDeliveryStatus(deliveryId: string): Promise<{ delivery: DeliverySummary }> {
    return this.request<{ delivery: DeliverySummary }>(`/v1/deliveries/${encodeURIComponent(deliveryId)}`, {
      method: "GET"
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {})
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await this.fetchImpl(`${this.endpoint}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...init.headers
      }
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      const error = payload?.error ?? {};
      throw new PingBridgeClientError(
        response.status,
        error.code ?? "request_failed",
        error.message ?? response.statusText
      );
    }

    return payload as T;
  }
}
