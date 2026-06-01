# Discord Moderation Watcher Bot - Microservices Architecture

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- pnpm 11+
- Discord bot token
- OpenAI API key

### Environment Setup

Create `.env.local` in the root directory:

```bash
# Discord Configuration
DISCORD_TOKEN=your_discord_token_here
MONITOR_GUILD_ID=your_guild_id_here

# AI Configuration
AI_LLM_API_KEY=your_openai_api_key_here

# Optional: Database URL (defaults to PostgreSQL in Docker)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bete

# Optional: Redis URL (defaults to Redis in Docker)
REDIS_URL=redis://localhost:6379
```

### Local Development with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild services
docker-compose up -d --build
```

**Services will be available at:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Backend WebSocket: ws://localhost:3001
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Local Development without Docker

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm run db:migrate

# Start all services in separate terminals

# Terminal 1: Backend
cd services/backend
pnpm run dev

# Terminal 2: Discord Gateway
cd services/discord-gateway
pnpm run dev

# Terminal 3: Frontend
cd services/frontend
pnpm run dev:web
```

---

## Architecture Overview

### 3 Independent Microservices

#### 1. Frontend Service (`services/frontend/`)
- **Tech:** React 19, Vite, TanStack Query, WebSocket
- **Port:** 5173 (dev) / served by Backend (prod)
- **Responsibilities:**
  - Dashboard UI (analytics, messages, voice, media)
  - Real-time WebSocket connection to Backend
  - API calls to Backend REST endpoints
  - State management (React Query)

#### 2. Backend Service (`services/backend/`)
- **Tech:** Express, Drizzle ORM, PostgreSQL, Redis
- **Port:** 3001
- **Responsibilities:**
  - REST API endpoints (`/api/*`)
  - WebSocket server for real-time updates
  - Database operations (PostgreSQL)
  - Event orchestration from Discord Gateway
  - Static file serving (built Frontend)
  - Admin authentication

**Modular MVC Structure:**
```
services/backend/src/
├── shared/
│   ├── database/      → Drizzle ORM setup
│   ├── config/        → Environment config
│   ├── errors/        → Custom error classes
│   ├── middlewares/   → Express middlewares
│   ├── logger/        → Logging utilities
│   └── utils/         → Shared utilities
├── modules/
│   ├── messages/      → Message CRUD
│   ├── analytics/     → Analytics queries
│   ├── media/         → Media management
│   ├── voice/         → Voice recordings
│   └── health/        → Health checks
└── index.ts
```

#### 3. Discord Gateway Service (`services/discord-gateway/`)
- **Tech:** discord.js-selfbot-v13, @discordjs/voice, OpenAI API
- **Port:** None (internal service, no HTTP)
- **Responsibilities:**
  - Discord client connection
  - Message capture (create/edit/delete)
  - Voice channel recording
  - AI moderation analysis
  - Attachment upload
  - Event publishing to Backend (Redis pub/sub)

**Modular MVC Structure:**
```
services/discord-gateway/src/
├── shared/
│   ├── database/      → Drizzle ORM setup
│   ├── config/        → Environment config
│   ├── errors/        → Custom error classes
│   ├── logger/        → Logging utilities
│   └── utils/         → Shared utilities
├── modules/
│   ├── message-capture/    → Message listeners
│   ├── voice-recording/    → Voice recording
│   ├── ai-moderation/      → AI analysis
│   ├── attachment-upload/  → File uploads
│   └── event-broadcaster/  → Redis pub/sub
└── index.ts
```

### Shared Package (`packages/shared/`)
- **Types:** Common interfaces and data models
- **Errors:** Custom error classes
- **Logger:** Pino logger setup
- **Utils:** Pagination, validation, helpers

### Communication Patterns

**Frontend ↔ Backend:**
- REST API: `GET/POST /api/*` (HTTP)
- WebSocket: Real-time updates (JSON messages)
- Auth: Admin password header

**Backend ↔ Discord Gateway:**
- Redis pub/sub (low-latency, decoupled)
- Events: `discord:message:created`, `discord:voice:started`, etc.
- Backend subscribes and broadcasts to Frontend via WebSocket

**Shared Resources:**
- PostgreSQL: Both Backend and Discord Gateway
- Redis: Pub/sub and caching

---

## Development Workflow

### Adding a New API Endpoint

1. **Create module structure** (if new feature):
   ```bash
   mkdir -p services/backend/src/modules/feature/{routes,controllers,services,repositories,schemas}
   ```

2. **Define schema** (`feature.schema.ts`):
   ```typescript
   import { z } from 'zod';
   
   export const createFeatureSchema = z.object({
     name: z.string().min(1),
     description: z.string().optional(),
   });
   ```

3. **Create repository** (`feature.repository.ts`):
   ```typescript
   export async function createFeature(data: CreateFeatureInput) {
     return db.insert(features).values(data).returning();
   }
   ```

4. **Create service** (`feature.service.ts`):
   ```typescript
   export async function createFeatureService(data: CreateFeatureInput) {
     // Business logic, validation, orchestration
     return createFeature(data);
   }
   ```

5. **Create controller** (`feature.controller.ts`):
   ```typescript
   export async function createFeatureController(req: Request, res: Response) {
     const data = createFeatureSchema.parse(req.body);
     const result = await createFeatureService(data);
     res.json(result);
   }
   ```

6. **Create route** (`feature.route.ts`):
   ```typescript
   router.post('/features', createFeatureController);
   ```

### Adding a New Discord Event

1. **Create module** in `services/discord-gateway/src/modules/event-name/`

2. **Register listener** in `index.ts`:
   ```typescript
   client.on('eventName', async (data) => {
     await handleEvent(data);
     publishEvent('discord:event:name', data);
   });
   ```

3. **Publish to Redis**:
   ```typescript
   import { redis } from '../shared/redis';
   
   redis.publish('discord:event:name', JSON.stringify(data));
   ```

4. **Subscribe in Backend** (`services/backend/src/ws/server.ts`):
   ```typescript
   redis.subscribe('discord:event:name', (message) => {
     broadcastToClients({ type: 'event_name', data: JSON.parse(message) });
   });
   ```

---

## Testing

### Run All Tests
```bash
pnpm run test
```

### Run Tests for Specific Service
```bash
cd services/backend
pnpm run test

cd services/discord-gateway
pnpm run test
```

### Type Checking
```bash
pnpm run typecheck
```

### Linting
```bash
pnpm run lint
```

---

## Deployment

### Build Docker Images
```bash
docker-compose build
```

### Push to Container Registry
```bash
docker tag bete-backend ghcr.io/username/bete-backend:latest
docker push ghcr.io/username/bete-backend:latest
```

### Deploy to Production
See `.github/workflows/deploy.yml` for GitHub Actions CI/CD pipeline.

---

## Troubleshooting

### Backend can't connect to PostgreSQL
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check connection string
echo $DATABASE_URL

# Verify credentials
psql -h localhost -U postgres -d bete
```

### Discord Gateway not receiving events
```bash
# Check Redis connection
redis-cli ping

# Check Discord token
echo $DISCORD_TOKEN

# View logs
docker-compose logs discord-gateway
```

### Frontend can't connect to Backend
```bash
# Check Backend is running
curl http://localhost:3001/health

# Check WebSocket connection
# Open browser DevTools → Network → WS
```

---

## API Documentation

### Health Check
```bash
GET /health
```

### Messages
```bash
GET /api/messages?channel=<id>&type=text|image
POST /api/messages (admin only)
```

### Analytics
```bash
GET /api/analytics
```

### Voice Recordings
```bash
GET /api/recordings
```

### WebSocket Events
```
message_created
message_updated
message_deleted
attachment_uploaded
user_state
```

---

## Contributing

1. Create a feature branch
2. Make changes following Modular MVC pattern
3. Run tests and linting
4. Submit PR with description

---

## License

MIT
