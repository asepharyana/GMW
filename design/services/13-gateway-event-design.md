# Gateway Event Design — The Pulse of Discord

> *"Events are the heartbeat of a distributed system."*
> — Martin Fowler

---

## 🎯 Filosofi Gateway Events

Discord Gateway adalah **jantung event-driven** BETE:

1. **Single source of truth** — Events adalah satu-satunya cara data bergerak antar service
2. **At-least-once delivery** — Event bisa terkirim lebih dari sekali (idempotent consumers)
3. **Schema evolution** — Events punya versioning untuk backward compatibility
4. **Observable** — Setiap event tercatat untuk debugging dan audit

---

## 📦 Event Schema

### Envelope

```typescript
interface GatewayEvent<T = unknown> {
  /** Event type identifier — lowercase, colon-separated */
  type: string;

  /** Event payload */
  data: T;

  /** ISO 8601 timestamp of when the event was created */
  timestamp: string;

  /** Unique event ID for deduplication */
  eventId: string;

  /** Source service name */
  source: 'discord-gateway';

  /** Event schema version */
  version: number;

  /** Optional correlation ID for tracing request flows */
  correlationId?: string;
}
```

### Event Size Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Max payload size | 256KB | Larger payloads → reference via URL |
| Max nesting depth | 5 levels | Prevent billion laughs attack |
| String max length | 100KB | Truncate with `... (truncated)` suffix |

---

## 📋 Event Catalog

### Message Events

```typescript
// discord:message:created
interface MessageCreatedEvent {
  id: string;
  channelId: string;
  guildId: string;
  author: {
    id: string;
    name: string;
    discriminator: string;
    avatar: string | null;
    isBot: boolean;
  };
  content: string;
  timestamp: string;    // ISO 8601
  editedTimestamp: string | null;
  attachments: AttachmentInfo[];
  replyTo?: string;     // Parent message ID
}

// discord:message:updated
interface MessageUpdatedEvent {
  id: string;
  channelId: string;
  content: string;
  editedTimestamp: string;
}

// discord:message:deleted
interface MessageDeletedEvent {
  id: string;
  channelId: string;
  guildId: string;
}
```

### Analysis Events

```typescript
// discord:message:analyzed
interface MessageAnalyzedEvent {
  messageId: string;
  status: 'pending' | 'complete' | 'error';
  severity: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  categories: string[];
  confidence: number;           // 0–1
  summary: string;
  analyzedAt: string;
  processingTimeMs: number;
}
```

### Voice Events

```typescript
// discord:voice:started
interface VoiceStartedEvent {
  guildId: string;
  channelId: string;
  channelName: string;
  startedAt: string;
  participants: Array<{
    userId: string;
    userName: string;
  }>;
}

// discord:voice:stopped
interface VoiceStoppedEvent {
  guildId: string;
  channelId: string;
  duration: number;   // seconds
  segmentsCount: number;
}

// discord:voice:uploaded
interface VoiceUploadedEvent {
  segmentId: string;
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
  duration: number;
  fileUrl: string;
  fileSize: number;
  timestamp: string;
}
```

### Attachment Events

```typescript
// discord:attachment:created
interface AttachmentCreatedEvent {
  id: string;
  messageId: string;
  channelId: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
}

// discord:attachment:uploaded
interface AttachmentUploadedEvent {
  id: string;
  messageId: string;
  storageUrl: string;
  thumbnailUrl?: string;
  fileSize: number;
  processingTimeMs: number;
}
```

---

## 🔄 Event Lifecycle

```
┌──────────┐
│ Discord  │  (messageCreate, voiceStateUpdate, etc.)
└────┬─────┘
     │
     ↓
┌──────────────┐
│ Discord.js   │  (client events)
└────┬─────────┘
     │
     ↓
┌─────────────────────────────┐
│ Message Capture Controller  │  (messageCapture.ts)
│  - Parse event             │
│  - Store in database       │
│  - Publish to Redis        │
└────┬───────────────────────┘
     │
     ↓
┌─────────────────────┐
│ Redis Pub/Sub       │  (channel: discord:message:created)
└────┬────────────────┘
     │
     ├──────────────────────────────┐
     ↓                              ↓
┌──────────────────┐    ┌──────────────────┐
│ Backend Service  │    │ AI Moderation    │
│ - Index message  │    │ - Analyze text   │
│ - Store in DB    │    │ - Update status  │
│ - Broadcast WS   │    │ - Publish result │
└──────────────────┘    └──────────────────┘
```

---

## 🧪 Event Testing

```typescript
// Helper untuk generate test events
function createTestEvent<T>(type: string, data: T): GatewayEvent<T> {
  return {
    type,
    data,
    timestamp: new Date().toISOString(),
    eventId: crypto.randomUUID(),
    source: 'discord-gateway',
    version: 1,
  };
}

describe('MessageCreatedEvent', () => {
  it('is properly formatted', () => {
    const event = createTestEvent('discord:message:created', {
      id: 'msg_1',
      channelId: 'ch_1',
      guildId: 'guild_1',
      author: { id: 'user_1', name: 'Test', discriminator: '0000', avatar: null, isBot: false },
      content: 'Hello world',
      timestamp: new Date().toISOString(),
      editedTimestamp: null,
      attachments: [],
    });

    expect(event.type).toBe('discord:message:created');
    expect(event.data.content).toBe('Hello world');
    expect(event.source).toBe('discord-gateway');
    expect(event.version).toBe(1);
  });
});
```

---

## 📊 Event Performance Metrics

| Metric | Target | Alert |
|--------|--------|-------|
| Processing latency | <50ms p99 | >200ms |
| Event throughput | >1000/s | <100/s (unusual) |
| Redis publish latency | <5ms | >20ms |
| Event loss rate | 0% | >0.01% |
| Queue depth | <100 | >1000 |

---

## ⚠️ Anti-Patterns Events

### ❌ Processing-heavy event handlers
```typescript
// ❌ JANGAN — blocking event loop
eventBus.on('message:created', async (event) => {
  const result = await expensiveAnalysis(event.data.content);
  await db.save(result);
  // Event handler for 100 msg/s = bottleneck
});

// ✅ Queue heavy work
eventBus.on('message:created', async (event) => {
  await analysisQueue.add(event);  // Worker processes async
});
```

### ❌ Missing idempotency
```typescript
// ❌ JANGAN — duplicate events create duplicate records
async function handleMessageCreated(event) {
  await db.insert({ id: event.data.id, content: event.data.content });
  // If event arrives twice → duplicate key error
}

// ✅ Idempotent: UPSERT
async function handleMessageCreated(event) {
  await db.upsert({ id: event.data.id }, { content: event.data.content });
}
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [Redis Pub/Sub](https://redis.io/docs/manual/pubsub/) | Event backbone |
| [CloudEvents](https://cloudevents.io/) | Event schema standard |
| [Discord Gateway](https://discord.com/developers/docs/topics/gateway) | Discord events |

---

*"Setiap event adalah denyut nadi — tanda bahwa sistem masih hidup dan berbicara."* ❄️🩵
