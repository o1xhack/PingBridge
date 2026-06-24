import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  DeliveryStatus,
  DeliverySummary,
  EventStatus,
  NormalizedEvent,
  StoredDelivery,
  StoredEvent
} from "./types.js";

interface EventRow {
  id: string;
  created_at: string;
  source: string;
  event_type: string;
  target: string;
  title: string;
  message: string;
  severity: string;
  changed: number;
  dedupe_key: string | null;
  status: string;
  payload_json: string;
}

interface DeliveryRow {
  id: string;
  event_id: string;
  channel_id: string;
  channel_type: string;
  status: string;
  attempts: number;
  provider_message_id: string | null;
  status_code: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export class PingBridgeStore {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  insertEvent(event: { id: string; createdAt: string; input: NormalizedEvent; status: EventStatus }): void {
    this.db
      .prepare(
        `INSERT INTO events (
          id, created_at, source, event_type, target, title, message,
          severity, changed, dedupe_key, status, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.createdAt,
        event.input.source,
        event.input.eventType,
        event.input.target,
        event.input.title,
        event.input.message,
        event.input.severity,
        event.input.changed ? 1 : 0,
        event.input.dedupeKey ?? null,
        event.status,
        JSON.stringify(event.input)
      );
  }

  updateEventStatus(eventId: string, status: EventStatus): void {
    this.db.prepare("UPDATE events SET status = ? WHERE id = ?").run(status, eventId);
  }

  hasRecentDedupeKey(dedupeKey: string, sinceIso: string): boolean {
    const row = this.db
      .prepare(
        `SELECT id FROM events
         WHERE dedupe_key = ?
           AND created_at >= ?
           AND status != 'deduplicated'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(dedupeKey, sinceIso);
    return Boolean(row);
  }

  insertDelivery(delivery: {
    id: string;
    eventId: string;
    channelId: string;
    channelType: string;
    createdAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO deliveries (
          id, event_id, channel_id, channel_type, status, attempts,
          provider_message_id, status_code, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'queued', 0, NULL, NULL, NULL, ?, ?)`
      )
      .run(
        delivery.id,
        delivery.eventId,
        delivery.channelId,
        delivery.channelType,
        delivery.createdAt,
        delivery.createdAt
      );
  }

  updateDelivery(delivery: {
    id: string;
    status: DeliveryStatus;
    attempts: number;
    providerMessageId?: string;
    statusCode?: number;
    error?: string;
    updatedAt: string;
  }): void {
    this.db
      .prepare(
        `UPDATE deliveries
         SET status = ?, attempts = ?, provider_message_id = ?, status_code = ?, error = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        delivery.status,
        delivery.attempts,
        delivery.providerMessageId ?? null,
        delivery.statusCode ?? null,
        delivery.error ?? null,
        delivery.updatedAt,
        delivery.id
      );
  }

  listRecentEvents(limit = 20): StoredEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT ?")
      .all(Math.max(1, Math.min(limit, 100))) as unknown as EventRow[];
    return rows.map(mapEventRow);
  }

  listFailedDeliveries(limit = 20): StoredDelivery[] {
    const rows = this.db
      .prepare("SELECT * FROM deliveries WHERE status = 'failed' ORDER BY updated_at DESC LIMIT ?")
      .all(Math.max(1, Math.min(limit, 100))) as unknown as DeliveryRow[];
    return rows.map(mapDeliveryRow);
  }

  getDelivery(id: string): StoredDelivery | undefined {
    const row = this.db.prepare("SELECT * FROM deliveries WHERE id = ?").get(id) as DeliveryRow | undefined;
    return row ? mapDeliveryRow(row) : undefined;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        source TEXT NOT NULL,
        event_type TEXT NOT NULL,
        target TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT NOT NULL,
        changed INTEGER NOT NULL,
        dedupe_key TEXT,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_dedupe ON events(dedupe_key, created_at);

      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        provider_message_id TEXT,
        status_code INTEGER,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_deliveries_event_id ON deliveries(event_id);
    `);
  }
}

function mapEventRow(row: EventRow): StoredEvent {
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    eventType: row.event_type,
    target: row.target,
    title: row.title,
    message: row.message,
    severity: row.severity as StoredEvent["severity"],
    changed: row.changed === 1,
    dedupeKey: row.dedupe_key ?? undefined,
    status: row.status as EventStatus,
    payload: JSON.parse(row.payload_json)
  };
}

function mapDeliveryRow(row: DeliveryRow): StoredDelivery {
  return {
    id: row.id,
    eventId: row.event_id,
    channel: row.channel_id,
    channelType: row.channel_type as StoredDelivery["channelType"],
    status: row.status as DeliveryStatus,
    attempts: row.attempts,
    providerMessageId: row.provider_message_id ?? undefined,
    statusCode: row.status_code ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toDeliverySummary(delivery: StoredDelivery): DeliverySummary {
  return {
    id: delivery.id,
    channel: delivery.channel,
    channelType: delivery.channelType,
    status: delivery.status,
    attempts: delivery.attempts,
    providerMessageId: delivery.providerMessageId,
    statusCode: delivery.statusCode,
    error: delivery.error
  };
}
