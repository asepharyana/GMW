# Backend API Guidelines — The Nerve Center

> *"APIs are contracts. Design them with the same care as legal documents."*
> — Unknown

---

## 🎯 Filosofi API

Backend API BETE adalah **fasilitator antara data dan tampilan**:
1. **RESTful by design** — Sumber daya, bukan aksi
2. **Type-safe** — Zod schemas di setiap endpoint
3. **Consistent pagination** — Tidak ada kejutan format
4. **Error as structure** — Setiap error punya kode dan resolusi

---

## 📐 API Design Principles

### URL Structure

```
GET    /api/v1/messages          # List messages
GET    /api/v1/messages/:id      # Single message
GET    /api/v1/channels          # List channels
GET    /api/v1/analytics/overview # Analytics
GET    /api/v1/voice/connections  # Voice connections
POST   /api/v1/voice/connect     # Connect to voice
POST   /api/v1/voice/disconnect  # Disconnect
```

### Response Envelope

```typescript
// Success
{
  "success": true,
  "data": T,
  "meta"?: {
    "page": 1,
    "limit": 50,
    "total": 1234,
    "hasMore": true
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid channelId format",
    "details": {
      "field": "channelId",
      "constraint": "numeric_string"
    },
    "requestId": "req_abc123"
  }
}
```

### Pagination

```typescript
interface PaginationParams {
  page?: number;     // Default: 1
  limit?: number;    // Default: 50, Max: 200
  cursor?: string;   // For cursor-based pagination
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}
```

### Filtering

```typescript
interface FilterParams {
  search?: string;
  channelId?: string;
  userId?: string;
  severity?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  dateFrom?: string;  // ISO 8601
  dateTo?: string;    // ISO 8601
  sortBy?: string;    // Field name
  sortOrder?: 'asc' | 'desc';
}
```

---

## 🏗️ Module Structure (Backend)

```
services/backend/src/modules/
├── messages/
│   ├── messages.schema.ts       # Zod schemas
│   ├── messages.repository.ts   # Database queries
│   ├── messages.service.ts      # Business logic
│   ├── messages.controller.ts   # Request handlers
│   └── routes/
│       └── index.ts             # Express router
├── analytics/
├── voice/
├── media/
└── health/
```

### Layer Rules

```
Controller (parse + validate) → Service (business logic) → Repository (DB queries)
                                  ↕
                            Shared Infrastructure
                         (config, logger, errors)
```

---

## ⚡ WebSocket Events

### Event Format

```typescript
interface WsEvent<T = unknown> {
  type: string;           // e.g., "message:created"
  data: T;
  timestamp: number;
  requestId?: string;
}

// Server → Client events
{
  "type": "message:created",
  "data": {
    "id": "msg_123",
    "content": "...",
    "author": { "id": "user_1", "name": "User" }
  },
  "timestamp": 1750000000000
}

// Client → Server events
{
  "type": "voice:connect",
  "data": {
    "guildId": "123456789",
    "channelId": "987654321"
  }
}
```

### Event Catalog

| Type | Direction | Description |
|------|-----------|-------------|
| `message:created` | Server → Client | New message captured |
| `message:updated` | Server → Client | Message edited |
| `message:deleted` | Server → Client | Message removed |
| `message:analyzed` | Server → Client | AI analysis complete |
| `voice:state` | Server → Client | Voice connection state |
| `voice:speaker` | Server → Client | Speaker activity |
| `attachment:uploaded` | Server → Client | Attachment uploaded |
| `analytics:update` | Server → Client | Analytics data refresh |

---

## 🔒 Authentication & Authorization

```typescript
// Admin auth via header
Authorization: Bearer <admin-password-hash>

// Rate limiting
RateLimit: 100/minute per IP
Retry-After: 60
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input |
| `UNAUTHORIZED` | 401 | Invalid/missing auth |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected error |
| `SERVICE_UNAVAILABLE` | 503 | Downstream failure |

---

## 🧪 Testing Strategy

```typescript
describe('GET /api/v1/messages', () => {
  it('returns paginated messages', async () => {
    const res = await request(app).get('/api/v1/messages?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.hasMore).toBeDefined();
  });

  it('rejects invalid severity filter', async () => {
    const res = await request(app).get('/api/v1/messages?severity=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

---

## ⚠️ API Anti-Patterns

### ❌ Nested resources terlalu dalam
```
// ❌ JANGAN
GET /api/v1/guilds/123/channels/456/messages/789

// ✅ Flat dengan query params
GET /api/v1/messages?channelId=456
```

### ❌ Inconsistent error format
```typescript
// ❌ JANGAN — kadang string, kadang object
if (err) return res.status(400).send('Bad request');
if (err) return res.status(400).json({ message: 'Bad request' });

// ✅ Consistent envelope
if (err) return res.status(400).json({
  success: false,
  error: { code: 'VALIDATION_ERROR', message: 'Bad request' }
});
```

### ❌ No type safety
```typescript
// ❌ JANGAN — any, tidak ada validasi
app.get('/api/messages', async (req, res) => {
  const messages = await db.query('SELECT * FROM messages');
  res.json(messages);
});

// ✅ Zod schema + typed handler
app.get('/api/v1/messages', asyncHandler(async (req, res) => {
  const query = messageQuerySchema.parse(req.query);
  const messages = await messagesService.list(query);
  res.json({ success: true, data: messages });
}));
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [JSON:API](https://jsonapi.org/) | Response format spec |
| [Express.js](https://expressjs.com/) | Server framework |
| [Zod](https://zod.dev/) | Schema validation |

---

*"API adalah jembatan ingatan — setiap request adalah percakapan."* ❄️🩵
