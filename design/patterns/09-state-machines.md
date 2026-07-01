# State Machines — The Flow of Data

> *"All happy families are alike; each unhappy family is unhappy in its own way."*
> — Tolstoy, adapted for component states.

---

## 🎯 Filosofi State Machine

Setiap komponen data-driven di BETE memiliki **4 state fundamental**:

```
IDLE → LOADING → SUCCESS
              ↘ ERROR
                  ↘ EMPTY (conditional, jika data.length === 0)
```

State machine memastikan **tidak ada kondisi yang terlewat** — setiap kemungkinan state visual memiliki representasi.

---

## 🎮 The Quad-State Pattern

```tsx
type DataState<T> =
  | { status: 'idle' }
  | { status: 'loading'; progress?: number }
  | { status: 'success'; data: T; timestamp: number }
  | { status: 'error'; error: Error; retryCount?: number }
  | { status: 'empty'; message?: string };
```

### Generic State Machine Hook

```tsx
// shared/hooks/useDataState.ts
function useDataState<T>(
  fetcher: () => Promise<T>,
  options?: {
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    retry?: number;
    cacheKey?: string;
  }
): {
  state: DataState<T>;
  execute: () => Promise<void>;
  reset: () => void;
  retry: () => Promise<void>;
  setData: (data: T) => void;
} {
  const [state, setState] = useState<DataState<T>>({ status: 'idle' });

  const execute = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await fetcher();
      if (Array.isArray(data) && data.length === 0) {
        setState({ status: 'empty', message: 'No data available' });
      } else {
        setState({ status: 'success', data, timestamp: Date.now() });
        options?.onSuccess?.(data);
      }
    } catch (error) {
      setState({ status: 'error', error: error as Error });
      options?.onError?.(error as Error);
    }
  }, [fetcher]);

  return { state, execute, reset, retry: execute, setData };
}
```

### Component Rendering

```tsx
function DataPanel() {
  const { state, execute, retry } = useDataState(fetchMessages);

  useEffect(() => { execute(); }, []);

  switch (state.status) {
    case 'idle':
    case 'loading':
      return <LoadingSkeleton />;

    case 'error':
      return (
        <ErrorState
          message={state.error.message}
          onRetry={retry}
          retryCount={state.retryCount}
        />
      );

    case 'empty':
      return <EmptyState message={state.message ?? 'Nothing here'} />;

    case 'success':
      return <DataView data={state.data} />;
  }
}
```

---

## 🖼️ Visual Representations

### Loading State

```tsx
interface LoadingSkeletonProps {
  variant?: 'card' | 'list' | 'detail' | 'table' | 'chart';
  count?: number;   // Jumlah skeleton items
}

/* Contoh variant 'card' */
function CardSkeleton() {
  return (
    <div className="card animate-shimmer" aria-busy="true" aria-label="Loading...">
      <Skeleton className="h-4 w-3/4 mb-3" />
      <Skeleton className="h-3 w-1/2 mb-2" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}
```

### Error State

```tsx
interface ErrorStateProps {
  error: Error;
  onRetry: () => void;
  retryCount?: number;
  variant?: 'inline' | 'full-page' | 'toast';
}

function ErrorState({ error, onRetry, retryCount }: ErrorStateProps) {
  const isRetryExhausted = (retryCount ?? 0) >= 3;

  return (
    <div className="flex flex-col items-center gap-4 py-12" role="alert">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm font-medium text-foreground">Something went wrong</p>
      <p className="text-xs text-muted-foreground">{error.message}</p>
      {!isRetryExhausted ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try Again
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Still failing after multiple attempts. Please try again later.
        </p>
      )}
    </div>
  );
}
```

### Empty State

```tsx
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  variant?: 'mascot' | 'icon' | 'minimal';
}

const EMPTY_STATES = {
  messages: { icon: MessageSquare, title: 'No messages yet', description: 'Messages will appear here once they are captured.' },
  speakers: { icon: Mic, title: 'No active speakers', description: 'Quiet in here...' },
  recordings: { icon: Radio, title: 'No recordings', description: 'Join a voice channel to start recording.' },
  analytics: { icon: BarChart3, title: 'Not enough data', description: 'Analytics will populate as data accumulates.' },
  users: { icon: Users, title: 'No users found', description: 'Try adjusting your filters.' },
};
```

---

## ♻️ State Transition Diagram

```
        ┌──────────┐
        │   IDLE   │
        └────┬─────┘
             │ execute()
             ↓
        ┌──────────┐
        │ LOADING  │◄────── retry()
        └────┬─────┘
             │
     ┌───────┴───────────┐
     │                   │
     ↓                   ↓
┌──────────┐      ┌──────────┐
│ SUCCESS  │      │  ERROR   │
│ data: T  │      │ err: E   │
└────┬─────┘      └────┬─────┘
     │                  │
     │ (data.length     │ retry()
     │  === 0)          │
     ↓                  │
┌──────────┐            │
│  EMPTY   │            │
│ msg: str │            │
└──────────┘            │
     │                  │
     └──────┬───────────┘
            │ reset()
            ↓
        ┌──────────┐
        │   IDLE   │
        └──────────┘
```

---

## 🔄 Retry Strategy

```typescript
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000,      // 1s
  maxDelay: 10000,      // 10s
  backoff: 'exponential' as const,
  onRetry: (attempt: number, error: Error) => {
    logger.warn(`Retry attempt ${attempt}`, { error: error.message });
  },
};
```

### Exponential Backoff

```typescript
function calculateDelay(attempt: number): number {
  return Math.min(
    1000 * Math.pow(2, attempt - 1),  // 1s, 2s, 4s
    10000  // cap at 10s
  );
}
```

---

## 📦 Component State Map

| Component | Loading | Error | Empty | Success |
|-----------|---------|-------|-------|---------|
| MessageFeed | Card skeletons | ErrorState + retry | Mascot "No messages" | Message list |
| VoiceCards | Card skeletons | ErrorState | "No connected channels" | VoiceCard list |
| ActiveSpeakers | Dot skeletons | Silent fallback | "No speakers" | Speaker list |
| Analytics | Skeleton grid | ErrorState | "Not enough data" | Charts |
| Recordings | List skeletons | ErrorState | "No recordings" | Recording list |
| UserList | List skeletons | ErrorState + retry | "No users found" | User list |
| DashboardStats | Stat skeletons | ErrorState | "No data available" | Stat grid |

---

## ⚠️ Anti-Patterns State

### ❌ Missing state handling
```tsx
// ❌ JANGAN — hanya handle SUCCESS
function Panel() {
  const { data, isLoading } = useQuery(...);
  if (isLoading) return <Spinner />;
  return <DataView data={data} />;  // ERROR? EMPTY?
}
```

### ❌ Loading state after error
```tsx
// ❌ JANGAN — loading infinite loop setelah error
function Panel() {
  const { data, isLoading } = useQuery(..., { retry: true });
  if (isLoading) return <Spinner />;
  // ERROR: retry=true + error = loading terus
}
```

### ❌ Empty state default terlalu generic
```tsx
// ❌ JANGAN — tidak helpful
<div>No data</div>

// ✅ Kontekstual dengan action
<EmptyState icon={MessageSquare} title="No messages" action={{ label: "Refresh", onClick: refetch }} />
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [State Reducer Pattern](https://kentcdodds.com/blog/state-reducer-pattern) | Advanced state management |
| [XState](https://stately.ai/docs/xstate) | Visual state machines |
| [React useReducer](https://react.dev/reference/react/useReducer) | Built-in state management |

---

*"Setiap state adalah babak dalam cerita data — dari sunyi hingga berbicara."* ❄️🩵
