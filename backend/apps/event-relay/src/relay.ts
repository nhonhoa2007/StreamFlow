import type { DatabaseHandle } from "@streamflow/database";
import { Kafka, type Producer } from "kafkajs";

export interface RelayRecord {
  topic: string;
  key: string;
  value: string;
}

export type EventPublisher = (records: RelayRecord[]) => Promise<void>;

export interface EventRelayOptions {
  dbHandle: DatabaseHandle;
  topic?: string;
  batchSize?: number;
  pollIntervalMs?: number;
  kafkaBrokers?: string[];
  publisher?: EventPublisher;
}

export interface EventRelayHandle {
  start: () => void;
  pollOnce: () => Promise<number>;
  close: () => Promise<void>;
}

export function createEventRelay(options: EventRelayOptions): EventRelayHandle {
  const {
    dbHandle,
    topic = "media-playback-events",
    batchSize = 50,
    pollIntervalMs = 1000,
    kafkaBrokers = ["127.0.0.1:9092"],
    publisher,
  } = options;

  let kafkaProducer: Producer | null = null;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  const getPublisher = async (): Promise<EventPublisher> => {
    if (publisher) return publisher;
    if (!kafkaProducer) {
      const kafka = new Kafka({
        clientId: "streamflow-event-relay",
        brokers: kafkaBrokers,
      });
      kafkaProducer = kafka.producer();
      await kafkaProducer.connect();
    }
    return async (records: RelayRecord[]) => {
      if (!kafkaProducer) return;
      await kafkaProducer.sendBatch({
        topicMessages: records.map((r) => ({
          topic: r.topic,
          messages: [{ key: r.key, value: r.value }],
        })),
      });
    };
  };

  const pollOnce = async (): Promise<number> => {
    // 1. Transactional claim with SKIP LOCKED
    const claimedRows = await dbHandle.client.begin(async (sql) => {
      const rows = await sql<
        Array<{
          id: string;
          aggregate_type: string;
          aggregate_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          created_at: Date;
        }>
      >`
        SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at
        FROM outbox_events
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;
      return rows;
    });

    if (claimedRows.length === 0) {
      return 0;
    }

    const publish = await getPublisher();

    // 2. Format Kafka records
    const records: RelayRecord[] = claimedRows.map((row) => ({
      topic,
      key: row.aggregate_id,
      value: JSON.stringify({
        eventId: row.id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        payload: row.payload,
        createdAt: row.created_at,
      }),
    }));

    // 3. Publish to Kafka
    await publish(records);

    // 4. Update outbox records to PUBLISHED
    const eventIds = claimedRows.map((r) => r.id);
    await dbHandle.client`
      UPDATE outbox_events
      SET status = 'PUBLISHED', published_at = NOW()
      WHERE id = ANY(${eventIds}::uuid[])
    `;

    return claimedRows.length;
  };

  const scheduleNext = () => {
    if (!running) return;
    timer = setTimeout(async () => {
      try {
        await pollOnce();
      } catch {
        // Continue on error
      } finally {
        scheduleNext();
      }
    }, pollIntervalMs);
  };

  return {
    start: () => {
      running = true;
      scheduleNext();
    },
    pollOnce,
    close: async () => {
      running = false;
      if (timer) clearTimeout(timer);
      if (kafkaProducer) {
        await kafkaProducer.disconnect();
      }
    },
  };
}
