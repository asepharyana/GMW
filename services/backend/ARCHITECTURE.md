# Backend Service Architecture Map

## Directory Structure

```
services/backend/
├── src/
│   ├── shared/                          # Shared infrastructure (no business logic)
│   │   ├── config/
│   │   │   └── index.ts                 # Zod-validated environment config
│   │   ├── database/
│   │   │   └── index.ts                 # Drizzle ORM initialization & connection pool
│   │   ├── errors/
│   │   │   └── index.ts                 # Custom error classes (AppError, ValidationError, etc.)
│   │   ├── logger/
│   │   │   └── index.ts                 # Pino logger with child context support
│   │   ├── middlewares/
│   │   │   └── index.ts                 # Express middleware (errorHandler, asyncHandler, rateLimit)
│   │   └── utils/                       # Utility functions (placeholder)
│   │
│   ├── modules/                         # Feature modules (Modular MVC pattern)
│   │   ├── messages/
│   │   │   ├── messages.schema.ts       # Zod validation schemas (MessageQuery, MessageCreate, MessageUpdate)
│   │   │   ├── messages.repository.ts   # Database operations (findMany, findById, create, update, delete)
│   │   │   ├── messages.service.ts      # Business logic (validation, orchestration)
│   │   │   ├── messages.controller.ts   # Request handlers (parse → service → response)
│   │   │   └── routes/
│   │   │       └── index.ts             # Express router (GET /api/messages, etc.)
│   │   │
│   │   ├── analytics/
│   │   │   ├── analytics.schema.ts
│   │   │   ├── analytics.repository.ts
│   │   │   ├── analytics.service.ts
│   │   │   ├── analytics.controller.ts
│   │   │   └── routes/
│   │   │       └── index.ts
│   │   │
│   │   ├── media/
│   │   │   ├── media.service.ts
│   │   │   └── routes/
│   │   │       └── index.ts
│   │   │
│   │   ├── voice/
│   │   │   ├── voice.service.ts
│   │   │   └── routes/
│   │   │       └── index.ts
│   │   │
│   │   └── health/
│   │       ├── health.schema.ts
│   │       ├── health.repository.ts
│   │       ├── health.service.ts
│   │       ├── health.controller.ts
│   │       └── routes/
│   │           └── index.ts
│   │
│   ├── http/
│   │   ├── app.ts                       # Express app factory (middleware, routes, error handler)
│   │   └── server.ts                    # HTTP server startup (port binding, graceful shutdown)
│   │
│   ├── ws/                              # WebSocket server (placeholder for real-time updates)
│   │   └── server.ts                    # Redis pub/sub listener for Discord Gateway events
│   │
│   └── index.ts                         # Entry point (main function, signal handlers)
│
├── package.json                         # Backend dependencies
├── tsconfig.json                        # TypeScript configuration
└── README.md                            # Backend-specific documentation
```

## Layer Separation

### 1. Controller Layer
**File:** `modules/*/[module].controller.ts`
**Responsibility:** HTTP request handling only
- Parse request (query, params, body)
- Validate using Zod schemas
- Call service methods
- Return HTTP response (200, 400, 404, 500)
- **No database calls**
- **No business logic**

**Example:**
```typescript
export function handleListMessages(req: Request, res: Response, next: NextFunction) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = messageQuerySchema.parse(req.query);
    const result = await messagesService.listMessages(query);
    res.json(result);
  })(req, res, next);
}
```

### 2. Service Layer
**File:** `modules/*/[module].service.ts`
**Responsibility:** Business logic and orchestration
- Validate input (throw ValidationError if invalid)
- Orchestrate repository calls
- Apply business rules
- Handle cross-cutting concerns (auth, permissions)
- **No database calls directly**
- **No HTTP request/response handling**

**Example:**
```typescript
async listMessages(query: MessageQuery) {
  if (!query.channelId && !query.guildId) {
    throw new ValidationError("Either channelId or guildId is required");
  }
  return messagesRepository.findMany(query);
}
```

### 3. Repository Layer
**File:** `modules/*/[module].repository.ts`
**Responsibility:** All database operations
- Execute Drizzle ORM queries
- Handle database errors
- Return raw data (no transformation)
- **No business logic**
- **No HTTP handling**

**Example:**
```typescript
async findMany(query: MessageQuery) {
  const db = getDatabase();
  return db.select().from(messagesTable).where(...).limit(query.limit);
}
```

### 4. Schema Layer
**File:** `modules/*/[module].schema.ts`
**Responsibility:** Zod validation schemas
- Define request/response types
- Validate at controller entry point
- Export TypeScript types

**Example:**
```typescript
export const messageQuerySchema = z.object({
  channelId: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
});
```

## Module Responsibilities

| Module | Purpose | Routes |
|--------|---------|--------|
| **messages** | Text message storage & retrieval | GET /api/messages, GET /api/messages/:channelId |
| **analytics** | Moderation statistics & trends | GET /api/analytics/overview, /daily-trend, /hourly-stats |
| **media** | Media file management | GET /api/media/list, POST /api/media/upload |
| **voice** | Voice recording management | GET /api/voice/recordings, POST /api/voice/connect |
| **health** | Service health checks | GET /api/health |

## Data Flow

### Request Flow (HTTP)
```
Client Request
    ↓
Express Router (routes/index.ts)
    ↓
Controller (parse request, validate schema)
    ↓
Service (business logic, validation)
    ↓
Repository (database query)
    ↓
Database (PostgreSQL)
    ↓
Repository (return data)
    ↓
Service (transform/orchestrate)
    ↓
Controller (format response)
    ↓
Client Response
```

### Event Flow (WebSocket - Future)
```
Discord Gateway (publishes event)
    ↓
Redis pub/sub
    ↓
Backend WebSocket Server (ws/server.ts)
    ↓
Broadcast to connected clients
    ↓
Frontend (receives real-time update)
```

## Dependency Rules

### ✅ Allowed
- Controller → Service
- Service → Repository
- Service → Config
- Service → Logger
- Repository → Database
- Any layer → Errors, Logger, Config

### ❌ Forbidden
- Repository → Service (data flows up, not down)
- Repository → Controller
- Service → HTTP (no req/res in service)
- Controller → Database (must go through service)
- Cross-module repository imports (each module owns its data)

## Error Handling

All errors inherit from `AppError` with `code` and `statusCode`:

```typescript
throw new ValidationError("Invalid input", { field: "error" });  // 400
throw new NotFoundError("Message not found");                     // 404
throw new UnauthorizedError("Invalid password");                  // 401
throw new ForbiddenError("Access denied");                        // 403
throw new AppError("Custom error", "CUSTOM_CODE", 500);           // 500
```

## Configuration

All config via environment variables (`.env`), validated with Zod in `shared/config/index.ts`:

```env
# Server
WEBSERVER_PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/discord_moderation
# OR
DATABASE_HOST=localhost
DATABASE_PORT=6432
DATABASE_NAME=discord_moderation
DATABASE_USER=postgres
DATABASE_PASSWORD=secret

# Redis (optional, for pub/sub)
REDIS_URL=redis://100.121.180.82:6379

# Discord
MONITOR_GUILD_ID=123456789

# Admin
ADMIN_PASSWORD=secret123
```

## Testing Strategy

Each module should have tests:
- `messages.repository.test.ts` — Database query tests
- `messages.service.test.ts` — Business logic tests
- `messages.controller.test.ts` — HTTP handler tests

Use Vitest with mocked database and services.

## Next Steps

1. **Migrate Drizzle schema** from `src/database/schema.ts` to `services/backend/src/shared/database/schema.ts`
2. **Implement repository queries** for each module using Drizzle ORM
3. **Add WebSocket server** in `src/ws/server.ts` with Redis pub/sub listener
4. **Create Discord Gateway service** in `services/discord-gateway/` (separate microservice)
5. **Add Docker & CI/CD** for multi-service deployment
6. **Write integration tests** for full request flow

## Circular Dependency Check

✅ No circular dependencies detected:
- Modules are independent (each owns its data)
- Layers flow upward only (Repository → Service → Controller)
- Shared infrastructure has no dependencies on modules
- Cross-module communication via events (Redis pub/sub), not direct imports
