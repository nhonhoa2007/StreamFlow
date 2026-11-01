import {
  type DatabaseHandle,
  claimPendingOutboxEvents,
  revertClaimedOutboxEvents,
} from "@streamflow/database";
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
  let inFlightPromise: Promise<number> | null = null;

  const getPublisher = async (): Promise<EventPublisher> => {
    if (publisher) return publisher;
    if (!kafkaProducer) {
      const kafka = new Kafka({
        clientId: "streamflow-event-relay",
        brokers: kafkaBrokers,
      });
      const producer = kafka.producer();
      try {
        await producer.connect();
        kafkaProducer = producer;
      } catch (err) {
        kafkaProducer = null;
        throw err;
      }
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

  const doPoll = async (): Promise<number> => {
    // 1. Transactional claim with atomic state transition to 'PROCESSING' via SKIP LOCKED
    const claimedRows = await claimPendingOutboxEvents(dbHandle.client, batchSize);

    if (claimedRows.length === 0) {
      return 0;
    }

    const eventIds = claimedRows.map((r) => r.id);

    try {
      const publish = await getPublisher();

      // 2. Format Kafka records (partition key = aggregate_id)
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
      await dbHandle.client`
        UPDATE outbox_events
        SET status = 'PUBLISHED', published_at = NOW()
        WHERE id = ANY(${eventIds}::uuid[])
      `;

      return claimedRows.length;
    } catch (err) {
      // Revert in-flight claimed rows to PENDING so another worker/poll can retry
      try {
        await revertClaimedOutboxEvents(dbHandle.client, eventIds);
      } catch {
        // Ignore secondary error
      }
      throw err;
    }
  };

  const pollOnce = async (): Promise<number> => {
    inFlightPromise = doPoll();
    try {
      return await inFlightPromise;
    } finally {
      inFlightPromise = null;
    }
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
      if (running) return; // Idempotent start
      running = true;
      scheduleNext();
    },
    pollOnce,
    close: async () => {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (inFlightPromise) {
        try {
          await inFlightPromise;
        } catch {
          // Ignore
        }
      }
      if (kafkaProducer) {
        await kafkaProducer.disconnect();
        kafkaProducer = null;
      }
    },
  };
}
