import type { PingBridgeClient } from "@pingbridge/client";
import type { NotifyInput } from "@pingbridge/client";

export interface PingBridgeToolHandlers {
  send_notification(input: NotifyInput): Promise<unknown>;
  test_channel(input: { channelId: string }): Promise<unknown>;
  list_channels(): Promise<unknown>;
  list_recent_events(input?: { limit?: number }): Promise<unknown>;
  list_failed_deliveries(input?: { limit?: number }): Promise<unknown>;
  get_delivery_status(input: { deliveryId: string }): Promise<unknown>;
}

export function createToolHandlers(client: PingBridgeClient): PingBridgeToolHandlers {
  return {
    send_notification: (input) => client.notify(input),
    test_channel: (input) => client.test(input.channelId),
    list_channels: () => client.listChannels(),
    list_recent_events: (input) => client.recent(input?.limit),
    list_failed_deliveries: (input) => client.failedDeliveries(input?.limit),
    get_delivery_status: (input) => client.getDeliveryStatus(input.deliveryId)
  };
}

export function toolResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}
