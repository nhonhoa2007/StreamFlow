import { type DatabaseHandle, processAnalyticsEventAtomic } from "@streamflow/database";
import { type Consumer, Kafka } from "kafkajs";

export interface AnalyticsEventMessage {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface AnalyticsConsumerOptions {
  dbHandle: DatabaseHandle;
  consumerGroup?: string;
  topic?: string;
  kafkaBrokers?: string[];
}

export interface AnalyticsConsumerHandle {
  processMessage: (msg: AnalyticsEventMessage) => Promise<{ processed: boolean }>;
  start: () => Promise<void>;
  close: () => Promise<void>;
}

export function createAnalyticsConsumer(
  options: AnalyticsConsumerOptions,
): AnalyticsConsumerHandle {
  const {
    dbHandle,
    consumerGroup = "streamflow-analytics-group",
    topic = "media-playback-events",
    kafkaBrokers = ["127.0.0.1:9092"],
  } = options;

  let consumer: Consumer | null = null;

  const processMessage = async (msg: AnalyticsEventMessage): Promise<{ processed: boolean }> => {
    if (msg.eventType === "playback.started" || msg.eventType === "playback.progress") {
      const watchTimeSeconds = Number(msg.payload?.watchTimeSeconds || 0);
      return await processAnalyticsEventAtomic(dbHandle.client, {
        eventId: msg.eventId,
        consumerGroup,
        mediaId: msg.aggregateId,
        timestamp: new Date(msg.createdAt),
        watchTimeSeconds,
      });
    }
    return { processed: false };
  };

  const start = async (): Promise<void> => {
    const kafka = new Kafka({
      clientId: "streamflow-analytics-consumer",
      brokers: kafkaBrokers,
    });

    consumer = kafka.consumer({ groupId: consumerGroup });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const parsed = JSON.parse(message.value.toString());
          await processMessage({
            eventId: parsed.eventId,
            aggregateType: parsed.aggregateType,
            aggregateId: parsed.aggregateId,
            eventType: parsed.eventType,
            payload: parsed.payload,
            createdAt: new Date(parsed.createdAt),
          });
        } catch {
          // Ignore malformed messages
        }
      },
    });
  };

  return {
    processMessage,
    start,
    close: async () => {
      if (consumer) {
        await consumer.disconnect();
      }
    },
  };
}
