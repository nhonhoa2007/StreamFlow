# StreamFlow — Transactional Outbox & Event-Driven Analytics Sequence

```mermaid
sequenceDiagram
  autonumber
  actor User as Client Player
  participant API as StreamFlow API
  participant DB as PostgreSQL (Primary)
  participant Relay as Event Relay Service
  participant Kafka as Apache Kafka Topic
  participant Consumer as Analytics Consumer

  Note over User,DB: Phase 1: Atomic Transaction (Zero Dual-Write Hazard)
  User->>API: POST /v1/playback/:id/start
  activate API
  API->>DB: BEGIN TRANSACTION
  API->>DB: INSERT INTO playback_sessions (...)
  API->>DB: INSERT INTO outbox_events (aggregate_id, event_type, status='PENDING')
  API->>DB: COMMIT TRANSACTION
  API-->>User: 201 Created (sessionId, positionMs)
  deactivate API

  Note over DB,Kafka: Phase 2: Autonomous Asynchronous Relay
  loop Every 1000ms Polling Loop
    Relay->>DB: SELECT * FROM outbox_events WHERE status = 'PENDING' FOR UPDATE SKIP LOCKED
    activate Relay
    DB-->>Relay: Return claimed events batch
    Relay->>Kafka: sendBatch(topic, messages=[{ key: aggregateId, value: eventJSON }])
    Kafka-->>Relay: Acknowledge batch publish
    Relay->>DB: UPDATE outbox_events SET status='PUBLISHED', published_at=NOW() WHERE id IN (...)
    deactivate Relay
  end

  Note over Kafka,Consumer: Phase 3: Idempotent Projection Update
  Kafka->>Consumer: Deliver message batch (key: mediaId)
  activate Consumer
  Consumer->>DB: BEGIN TRANSACTION
  Consumer->>DB: INSERT INTO processed_events (event_id, consumer_group) VALUES (...) ON CONFLICT DO NOTHING
  alt Event is New (First Delivery)
    Consumer->>DB: UPDATE media_playback_stats SET play_count = play_count + 1 WHERE media_id = ...
  else Event is Duplicate (Redelivered after crash)
    Note over Consumer,DB: Skip projection increment (Idempotent defense)
  end
  Consumer->>DB: COMMIT TRANSACTION
  Consumer->>Kafka: Commit partition offset
  deactivate Consumer
```

## Architectural Invariants
1. **Zero Dual-Write Risk:** Writing to `playback_sessions` and `outbox_events` within the same transaction ensures that an event is written if and only if the session is created.
2. **At-Least-Once Delivery to Kafka:** The Event Relay only marks an outbox record as `PUBLISHED` after Kafka explicitly acknowledges receipt.
3. **Idempotent Projections:** The Analytics Consumer guarantees that at-least-once message delivery produces exact-once business outcomes through inbox deduplication (`processed_events`).
