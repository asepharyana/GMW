# Frontend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor frontend for cleaner structure, API alignment, data-fetching consistency, rebranding, and dead code removal.

**Architecture:** Extract inline page components into `components/<feature>/` directories; split `voiceApi` into `voiceApi` + `mediaApi`; consolidate shared types; convert manual state hooks to React Query; rebrand names.

**Tech Stack:** React 19, Next.js 16 (App Router), TypeScript, TanStack Query, Tailwind v4

## Global Constraints

- Every page in `app/(dashboard)/` remains a `"use client"` `default export` function
- No changes to backend API endpoints or their paths
- No functional changes — visual output must be identical
- Import paths use `@/` alias throughout
- All existing exports from `hooks/index.ts` must remain (consumers may import from there)
- Rename "bete"/"GMW" → "Discord Automod" in user-visible text only

---

## File Map

### Infrastructure Changes
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/lib/ws-hook.ts` | Shared `WsHook` type consumed by 3 hook files |
| Modify | `src/hooks/use-messages.ts` | Import `WsHook` from shared |
| Modify | `src/hooks/use-media.ts` | Import `WsHook` from shared, fix import order |
| Modify | `src/hooks/use-recordings.ts` | Import `WsHook` from shared |
| Modify | `src/lib/navigation.ts` | Fix Settings icon (BarChart3 → Settings) |
| Modify | `src/components/shared/loading-skeleton.tsx` | Fix Tailwind v4 dynamic class |
| Modify | `src/components/layout/app-sidebar.tsx` | Consolidate `isActive` into shared utility |
| Modify | `src/components/layout/app-header.tsx` | Consolidate `isActive` into shared utility |
| Modify | `src/components/layout/mobile-nav.tsx` | Consolidate `isActive` into shared utility |

### API Separation
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/lib/api/media.ts` | Media player API (moved from voiceApi) |
| Modify | `src/lib/api/voice.ts` | Remove media methods, keep voice-only |
| Modify | `src/lib/api/index.ts` | Add `mediaApi` export |
| Modify | `src/hooks/use-media.ts` | Import from `mediaApi` instead of `voiceApi` |

### Dead Code Removal
| Action | File | Purpose |
|--------|------|---------|
| Delete | `src/components/landing/live-stats.tsx` | Unused — landing page redirects |
| Delete | `src/components/ui/item.tsx` | Unused component |
| Modify | `src/hooks/use-messages.ts` | Remove `useSearch` export |
| Modify | `src/hooks/index.ts` | Remove `useSearch` from re-exports |
| Modify | `src/lib/format.ts` | Remove duplicate `extractImage` (if present) |

### Feature Extraction: Messages
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/messages/message-card.tsx` | Extracted from messages/page.tsx |
| Create | `src/components/messages/ai-status-badge.tsx` | Extracted from messages/page.tsx |
| Create | `src/components/messages/message-detail-view.tsx` | Extracted: DetailView + MiniStat |
| Create | `src/components/messages/images-grid.tsx` | Images tab content (from messages/page.tsx) |
| Create | `src/components/messages/review-list.tsx` | Review tab content (from messages/page.tsx) |
| Modify | `src/app/(dashboard)/messages/page.tsx` | Use extracted components |

### Feature Extraction: Dashboard
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/dashboard/stats-section.tsx` | Extracted from dashboard/page.tsx StatsSection |
| Create | `src/components/dashboard/users-section.tsx` | Extracted from dashboard/page.tsx UsersSection |
| Create | `src/components/dashboard/user-detail-section.tsx` | Extracted from dashboard/page.tsx |
| Create | `src/components/dashboard/channels-section.tsx` | Extracted from dashboard/page.tsx |
| Create | `src/components/dashboard/channel-detail-section.tsx` | Extracted from dashboard/page.tsx |
| Modify | `src/app/(dashboard)/dashboard/page.tsx` | Use extracted components |

### Feature Extraction: Other Pages
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/voice/voice-connection-card.tsx` | Voice connection UI |
| Create | `src/components/voice/active-speakers-panel.tsx` | Active speakers list |
| Create | `src/components/voice/microphone-card.tsx` | Mic toggle UI |
| Modify | `src/app/(dashboard)/voice/page.tsx` | Use extracted components |
| Create | `src/components/media/music-player.tsx` | Media player UI |
| Modify | `src/app/(dashboard)/media/page.tsx` | Use extracted components |
| Create | `src/components/recordings/recording-list.tsx` | Recording list UI |
| Modify | `src/app/(dashboard)/recordings/page.tsx` | Use extracted components |
| Create | `src/components/analysis/search-panel.tsx` | Analysis search UI |
| Modify | `src/app/(dashboard)/analysis/page.tsx` | Use extracted components |

### Data Fetching Consistency
| Modify | `src/components/shared/guild-selector.tsx` | Use `useGuilds` + `useConfig` instead of manual fetch |
| Modify | `src/hooks/use-voice.ts` | `useVoiceChannels` → React Query |
| Modify | `src/components/chatbot/chatbot.tsx` | Use React Query for history + mutate for send |

### Rebranding
| Modify | `src/app/layout.tsx` | Title: "Discord Automod — Moderation Dashboard" |
| Modify | `src/app/(dashboard)/settings/page.tsx` | Text references |
| Modify | Various comments/files | "bete" → "Discord Automod", "GMW" → "Discord Automod" |

### Unused shadcn Cleanup
| Delete | `src/components/ui/*.tsx` | Components verified unused by grep |

---

## Tasks

### Task 1: Shared Infrastructure

**Files:**
- Create: `src/lib/ws-hook.ts`
- Modify: `src/hooks/use-messages.ts` (import WsHook)
- Modify: `src/hooks/use-media.ts` (import WsHook, fix import placement)
- Modify: `src/hooks/use-recordings.ts` (import WsHook)
- Modify: `src/lib/navigation.ts` (Settings icon)
- Modify: `src/components/shared/loading-skeleton.tsx` (fix grid)
- Modify: `src/components/layout/app-sidebar.tsx` (isActive → shared or inline)
- Modify: `src/components/layout/app-header.tsx` (same)
- Modify: `src/components/layout/mobile-nav.tsx` (same)

**Interfaces:**
- Produces: `WsHook` type in `lib/ws-hook.ts` — exact same shape as current duplicate
- Produces: `isActivePath(pathname: string, matchPrefix: string): boolean` — shared utility in lib

- [ ] **Step 1: Create `src/lib/ws-hook.ts`**

```typescript
import type { WsEventType } from "./ws/types";

export type WsHook = {
  on: <E extends WsEventType>(
    eventType: E,
    handler: (data: unknown) => void,
  ) => () => void;
};
```

- [ ] **Step 2: Update `src/hooks/use-messages.ts`**

Replace the local `WsHook` type definition with:
```typescript
import type { WsHook } from "@/lib/ws-hook";
```
And remove the local `type WsHook = ...` block (lines ~8-13).

- [ ] **Step 3: Update `src/hooks/use-media.ts`**

Same import replacement. Also move the `import { useEffect }` from line 61 to the top import block with the other react imports.

- [ ] **Step 4: Update `src/hooks/use-recordings.ts`**

Same import replacement.

- [ ] **Step 5: Fix navigation icon for Settings**

In `src/lib/navigation.ts`, change:
```typescript
import { ..., Settings, ... } from "lucide-react";
```
Replace `BarChart3` with `Settings` for the settings nav item.

- [ ] **Step 6: Fix `LoadingSkeleton` grid**

In `src/components/shared/loading-skeleton.tsx`, replace:
```tsx
columns > 1 ? `grid-cols-1 md:grid-cols-${columns}` : "grid-cols-1",
```
With:
```tsx
columns > 1 ? "grid-cols-1 md:grid-cols-2" as const : "grid-cols-1",
```
(Tailwind v4 doesn't support dynamic class construction. Max columns the app uses is 2, so hardcode md:grid-cols-2.)

- [ ] **Step 7: Create shared `isActivePath` utility**

In `src/lib/navigation.ts`, add:
```typescript
export function isActivePath(pathname: string, matchPrefix: string): boolean {
  if (matchPrefix === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(matchPrefix);
}
```

In `lib/utils.ts` or keep in `lib/navigation.ts` — I'll put it in `navigation.ts` since it's navigation-related.

- [ ] **Step 8: Update layout files to use shared `isActivePath`**

In `app-sidebar.tsx`, replace inline `isActive` with `import { isActivePath } from "@/lib/navigation"`.
In `app-header.tsx`, same.
In `mobile-nav.tsx`, same.

- [ ] **Step 9: Verify the app compiles**

Run: `cd /home/code/GMW/services/frontend && npx tsc --noEmit`
Expected: No type errors (or only pre-existing ones unrelated to these changes).

- [ ] **Step 10: Commit**

```bash
git add src/lib/ws-hook.ts src/hooks/use-messages.ts src/hooks/use-media.ts src/hooks/use-recordings.ts src/lib/navigation.ts src/components/shared/loading-skeleton.tsx src/components/layout/app-sidebar.tsx src/components/layout/app-header.tsx src/components/layout/mobile-nav.tsx
git commit -m "refactor(frontend): shared WsHook type, fix icon/grid, consolidate isActive"
```

---

### Task 2: API Layer Separation (voiceApi / mediaApi)

**Files:**
- Create: `src/lib/api/media.ts`
- Modify: `src/lib/api/voice.ts`
- Modify: `src/lib/api/index.ts`
- Modify: `src/hooks/use-media.ts`

**Interfaces:**
- Consumes: existing voiceApi shape
- Produces: `mediaApi` export with `getStatus`, `queue`, `skip`, `stop`, `volume`

- [ ] **Step 1: Create `src/lib/api/media.ts`**

```typescript
import type { MediaState } from "@/lib/types";
import { api } from "./client";

export const mediaApi = {
  getStatus: () => api.get<MediaState>("/api/media/status"),
  queue: (source: string, mode: string) =>
    api.post<MediaState>("/api/media/queue", { source, mode }),
  skip: () => api.post<MediaState>("/api/media/skip", {}),
  stop: () => api.post<MediaState>("/api/media/stop", {}),
  volume: (volume: number) =>
    api.post<MediaState>("/api/media/volume", { volume }),
};
```

- [ ] **Step 2: Remove media methods from `src/lib/api/voice.ts`**

Delete `getMediaStatus`, `mediaQueue`, `mediaSkip`, `mediaStop`, `mediaVolume`.
Remove `MediaState` from the import (keep `Channel`, `Guild`, `VoiceStatus`).

```typescript
import type { Channel, Guild, VoiceStatus } from "@/lib/types";
import { api } from "./client";

export const voiceApi = {
  getGuilds: () => api.get<Guild[]>("/api/guilds"),
  getTextChannels: (guildId: string) =>
    api.get<Channel[]>(`/api/guilds/${guildId}/channels`),
  getVoiceChannels: (guildId: string) =>
    api.get<Channel[]>(`/api/guilds/${guildId}/voice-channels`),
  getStatus: () => api.get<VoiceStatus>("/api/voice/status"),
  connect: (guildId: string, channelId: string) =>
    api.post<VoiceStatus>("/api/voice/connect", { guildId, channelId }),
  disconnect: () => api.post<VoiceStatus>("/api/voice/disconnect", {}),
  sendCommand: (command: string) =>
    api.post<{ success: boolean; command: string }>("/api/voice/command", {
      command,
    }),
};
```

- [ ] **Step 3: Update `src/lib/api/index.ts`**

```typescript
export { chatbotApi } from "./chatbot";
export { ApiError, api, apiRequest } from "./client";
export { configApi } from "./config";
export { dashboardApi } from "./dashboard";
export { mediaApi } from "./media";
export { messagesApi } from "./messages";
export { recordingsApi } from "./recordings";
export { uiStateApi } from "./ui-state";
export { voiceApi } from "./voice";
```

- [ ] **Step 4: Update `src/hooks/use-media.ts`**

Change the import from `voiceApi` to `mediaApi`:
```typescript
import { mediaApi } from "@/lib/api";
```
Replace all `voiceApi.getMediaStatus()` → `mediaApi.getStatus()`, `voiceApi.mediaQueue(...)` → `mediaApi.queue(...)`, etc.

- [ ] **Step 5: Typecheck**

Run: `cd /home/code/GMW/services/frontend && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/media.ts src/lib/api/voice.ts src/lib/api/index.ts src/hooks/use-media.ts
git commit -m "refactor(frontend): split mediaApi from voiceApi"
```

---

### Task 3: Dead Code Removal

**Files:**
- Delete: `src/components/landing/live-stats.tsx`
- Delete: `src/components/ui/item.tsx`
- Delete: `src/components/landing/` (if empty after)
- Modify: `src/hooks/use-messages.ts` (remove `useSearch`)
- Modify: `src/hooks/index.ts` (remove `useSearch` export)

- [ ] **Step 1: Delete `src/components/landing/live-stats.tsx`**

```bash
rm src/components/landing/live-stats.tsx
```

- [ ] **Step 2: Delete `src/components/ui/item.tsx`**

```bash
rm src/components/ui/item.tsx
```

- [ ] **Step 3: Remove `useSearch` from `use-messages.ts`**

Delete the entire `useSearch` function (lines ~103-109).

- [ ] **Step 4: Update `hooks/index.ts`**

Remove `useSearch` from the re-export line:
```typescript
export {
  useImages,
  useLoadMore,
  useMessageDetail,
  useMessages,
  useMessagesHasMore,
  useMessagesWsSync,
  useReanalyze,
  useReanalyzeBatch,
  useReview,
  useTextChannels,
} from "./use-messages";
```

- [ ] **Step 5: Remove `components/landing/` directory if empty**

```bash
rmdir src/components/landing/ 2>/dev/null || true
```

- [ ] **Step 6: Typecheck & commit**

```bash
cd /home/code/GMW/services/frontend && npx tsc --noEmit
git add src/components/landing/ src/components/ui/item.tsx src/hooks/use-messages.ts src/hooks/index.ts
git commit -m "refactor(frontend): remove dead code (live-stats, item, useSearch)"
```

---

### Task 4: Messages Feature Components

**Files:**
- Create: `src/components/messages/ai-status-badge.tsx`
- Create: `src/components/messages/message-card.tsx`
- Create: `src/components/messages/message-detail-view.tsx`
- Create: `src/components/messages/images-grid.tsx`
- Create: `src/components/messages/review-list.tsx`
- Modify: `src/app/(dashboard)/messages/page.tsx`

**Interfaces:**
- Consumes: `MessageRecord`, `AttachmentRecord` types from `@/lib/types`
- Produces: Exported components consumed by `messages/page.tsx`

- [ ] **Step 1: Create `src/components/messages/ai-status-badge.tsx`**

Extract the `AiStatusBadge` function from `messages/page.tsx`:
```typescript
"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  clean: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
  warn: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  flagged: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  error: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/20",
  pending: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  processing: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
};

export function AiStatusBadge({ status }: { status?: string | null }) {
  const style = STATUS_STYLES[status ?? ""];
  if (!style) return null;
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] px-1.5 py-0 h-4 font-medium", style)}
    >
      {status}
    </Badge>
  );
}
```

- [ ] **Step 2: Create `src/components/messages/message-card.tsx`**

Extract `MessageCard` + `extractFirstImage` helper:
```typescript
"use client";

import { Hash, Progress, RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AiStatusBadge } from "./ai-status-badge";
import { safeParseJsonArray } from "@/lib/format";
import type { MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

function extractFirstImage(metadata: string | null | undefined): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata);
    const atts: Array<{ url: string; contentType?: string }> = m.attachments ?? [];
    return atts.find((a) => a.contentType?.startsWith("image/"))?.url ?? null;
  } catch {
    return null;
  }
}

const SEVERITY_BORDERS: Record<string, string> = {
  low: "border-l-sky-400",
  medium: "border-l-yellow-400",
  high: "border-l-orange-400",
  critical: "border-l-red-500",
};

export function MessageCard({
  message: msg,
  onClick,
  onReanalyze,
}: {
  message: MessageRecord;
  onClick: (id: string) => void;
  onReanalyze: (id: string) => void;
}) {
  const severity = SEVERITY_BORDERS[msg.ai_severity ?? ""];
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:bg-accent/5 hover:shadow-sm",
        severity && "border-l-2",
        severity,
      )}
      onClick={() => onClick(msg.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-8 shrink-0 mt-0.5">
            <AvatarImage src={msg.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {msg.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{msg.username}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(msg.created_at).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                <Hash className="size-3 inline mr-0.5" />
                {msg.channel_id.slice(0, 8)}
              </span>
              <AiStatusBadge status={msg.ai_status} />
              {msg.ai_severity && msg.ai_severity !== "none" && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  {msg.ai_severity}
                </Badge>
              )}
              {msg.type === "deleted" && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  deleted
                </Badge>
              )}
              {msg.type === "edited" && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  edited
                </Badge>
              )}
            </div>
            <p
              className={cn(
                "text-sm leading-relaxed",
                msg.type === "deleted" && "italic text-muted-foreground line-through",
              )}
            >
              {msg.content}
            </p>
            {(() => {
              const u = extractFirstImage(msg.metadata);
              if (!u) return null;
              return (
                <img
                  src={u}
                  alt=""
                  className="mt-2 max-h-48 rounded-lg border border-border/50 object-cover"
                />
              );
            })()}
            {msg.ai_moderation_flags && msg.ai_moderation_flags !== "[]" && (
              <div className="flex flex-wrap gap-1">
                {safeParseJsonArray(msg.ai_moderation_flags).map((f) => (
                  <Badge key={f} variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                    {f}
                  </Badge>
                ))}
              </div>
            )}
            {msg.ai_analysis && (
              <p className="text-xs text-muted-foreground italic line-clamp-2 leading-relaxed">
                {msg.ai_analysis}
              </p>
            )}
            {msg.ai_confidence != null && (
              <div className="flex items-center gap-2 max-w-40">
                <Progress value={msg.ai_confidence * 100} className="h-1.5" />
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {(msg.ai_confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onReanalyze(msg.id);
              }}
            >
              <RefreshCw className="size-3 mr-1" /> Reanalyze
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create `src/components/messages/message-detail-view.tsx`**

Extract `DetailView` + `MiniStat`:
```typescript
"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatBytes, safeParseJsonArray } from "@/lib/format";
import type { MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DetailAttachment {
  id: string;
  filename: string;
  type: string;
  size: number;
  uploaded_url?: string | null;
  discord_url?: string | null;
}

function MiniStat({
  label,
  value,
  destructive,
  capitalize,
}: {
  label: string;
  value: string;
  destructive?: boolean;
  capitalize?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-sm font-medium mt-0.5",
            capitalize && "capitalize",
            destructive && "text-destructive",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function MessageDetailView({
  message,
  attachments,
}: {
  message: MessageRecord;
  attachments: DetailAttachment[];
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          <AvatarImage src={message.avatar_url ?? undefined} />
          <AvatarFallback>
            {message.username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{message.username}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.created_at).toLocaleString()}
            </span>
            {message.type === "deleted" && (
              <Badge variant="destructive" className="text-[10px]">deleted</Badge>
            )}
            {message.type === "edited" && (
              <Badge variant="outline" className="text-[10px]">edited</Badge>
            )}
          </div>
          <p className="text-sm mt-2 whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
      {message.ai_analysis && (
        <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-4 text-primary" />
            <p className="text-xs text-muted-foreground font-medium">AI Analysis</p>
          </div>
          <p className="text-sm leading-relaxed">{message.ai_analysis}</p>
        </div>
      )}
      {message.ai_moderation_flags && message.ai_moderation_flags !== "[]" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Moderation Flags</p>
          <div className="flex flex-wrap gap-1.5">
            {safeParseJsonArray(message.ai_moderation_flags).map((f) => (
              <Badge key={f} variant="destructive" className="text-[11px]">{f}</Badge>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {message.ai_status && (
          <MiniStat label="Status" value={message.ai_status} capitalize />
        )}
        {message.ai_severity && message.ai_severity !== "none" && (
          <MiniStat label="Severity" value={message.ai_severity} destructive capitalize />
        )}
        {message.ai_confidence != null && (
          <MiniStat label="Confidence" value={`${(message.ai_confidence * 100).toFixed(0)}%`} />
        )}
        {message.ai_recommended_action && message.ai_recommended_action !== "none" && (
          <MiniStat label="Action" value={message.ai_recommended_action} capitalize />
        )}
      </div>
      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Attachments ({attachments.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={a.uploaded_url ?? a.discord_url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border/50 p-2 hover:bg-muted transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{a.filename}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.type} · {formatBytes(a.size)}
                  </p>
                </div>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/messages/images-grid.tsx`**

```typescript
"use client";

import { ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { MessageRecord } from "@/lib/types";

function extractImage(metadata: string | null | undefined): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata);
    const atts: Array<{ url: string; contentType?: string }> = m.attachments ?? [];
    return atts.find((a) => a.contentType?.startsWith("image/"))?.url ?? null;
  } catch {
    return null;
  }
}

export function ImagesGrid({
  images,
  onClick,
}: {
  images: MessageRecord[];
  onClick: (id: string) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
        <ImageIcon className="size-10 text-muted-foreground/40 mb-3" aria-label="No images" />
        <p className="text-sm text-muted-foreground">No images yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 animate-fade-in-up">
      {images.map((msg) => {
        const imgUrl = extractImage(msg.metadata);
        return (
          <Card
            key={msg.id}
            className="group relative overflow-hidden cursor-pointer"
            onClick={() => onClick(msg.id)}
          >
            <div className="aspect-square relative bg-muted">
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt={msg.content || "Image"}
                  className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex items-center justify-center size-full text-muted-foreground text-xs">
                  No image
                </div>
              )}
              {msg.content && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-3">
                  <p className="text-xs text-white/90 line-clamp-2">
                    {msg.username}: {msg.content}
                  </p>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/messages/review-list.tsx`**

```typescript
"use client";

import { Flag } from "lucide-react";
import { MessageCard } from "./message-card";
import type { MessageRecord } from "@/lib/types";

export function ReviewList({
  reviews,
  onClick,
  onReanalyze,
}: {
  reviews: MessageRecord[];
  onClick: (id: string) => void;
  onReanalyze: (id: string) => void;
}) {
  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Flag className="size-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No flagged messages to review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-in-up">
      {reviews.map((msg) => (
        <MessageCard
          key={msg.id}
          message={msg}
          onClick={onClick}
          onReanalyze={onReanalyze}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Simplify `src/app/(dashboard)/messages/page.tsx`**

Replace the entire file with a thin composition layer:
```typescript
"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag, Loader2, RefreshCw, Search } from "lucide-react";

import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared";
import { GuildSelector } from "@/components/shared/guild-selector";
import { ImagesGrid } from "@/components/messages/images-grid";
import { MessageCard } from "@/components/messages/message-card";
import { MessageDetailView } from "@/components/messages/message-detail-view";
import { ReviewList } from "@/components/messages/review-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useImages,
  useLoadMore,
  useMessageDetail,
  useMessages,
  useMessagesHasMore,
  useMessagesWsSync,
  useReanalyze,
  useReanalyzeBatch,
  useReview,
  useTextChannels,
} from "@/hooks";
import { messagesApi } from "@/lib/api";
import { useWebSocket } from "@/lib/ws/context";

export default function MessagesPage() {
  const [guildId, setGuildId] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [viewTab, setViewTab] = useState<"all" | "images" | "review">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const ws = useWebSocket();
  const { data: channels = [] } = useTextChannels(guildId);
  const { data: messages, isLoading, error, refetch } = useMessages(guildId, selectedChannel || undefined);
  const { data: cursorData, refetch: refetchCursor } = useMessagesHasMore(guildId, selectedChannel || undefined);
  const loadMoreMut = useLoadMore();
  const { data: images } = useImages(guildId);
  const { data: reviews } = useReview(selectedChannel || undefined);
  const reanalyzeMut = useReanalyze();
  const reanalyzeBatchMut = useReanalyzeBatch();

  useMessagesWsSync(ws, guildId);

  const { message: detailMessage, attachments: detailAttachments, loading: detailLoading } = useMessageDetail(detailId);

  const [searchEnabled, setSearchEnabled] = useState(false);
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ["messages-search", guildId, searchQuery],
    queryFn: async () => {
      const result = await messagesApi.search(searchQuery, 50);
      return result.results;
    },
    enabled: searchEnabled && !!searchQuery && !!guildId,
  });

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    setSearchEnabled(true);
  }, [searchQuery]);

  const handleLoadMore = useCallback(() => {
    if (!cursorData?.cursor || loadMoreMut.isPending) return;
    loadMoreMut.mutate({
      guildId,
      channelId: selectedChannel || undefined,
      cursor: cursorData.cursor,
    });
  }, [cursorData, loadMoreMut, guildId, selectedChannel]);

  const displayMessages = searchResults ?? messages ?? [];
  const hasMore = cursorData?.hasMore ?? false;
  const isEmpty = !isLoading && displayMessages.length === 0;

  if (error) {
    return (
      <div className="space-y-5">
        <GuildSelector value={guildId} onChange={setGuildId} />
        <ErrorState message={error.message} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <GuildSelector value={guildId} onChange={setGuildId} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9 h-9"
          />
        </div>
        {channels.length > 0 && (
          <Select
            value={selectedChannel}
            onValueChange={(v) => v && setSelectedChannel(v)}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" ">All channels</SelectItem>
              {channels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}># {ch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" onClick={() => reanalyzeBatchMut.mutate(guildId)}>
          <RefreshCw className="size-4 mr-1.5" />
          Reanalyze Errors
        </Button>
      </div>

      <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as typeof viewTab)}>
        <TabsList>
          <TabsTrigger value="all">All ({(searchResults ?? messages)?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="images">Images ({images?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="review">
            <Flag className="size-3.5 mr-1" /> Review ({reviews?.length ?? 0})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {searchResults && (
        <p className="text-sm text-muted-foreground animate-fade-in-up">
          Found {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
        </p>
      )}

      {viewTab === "all" && (
        <div className="space-y-2 animate-fade-in-up">
          {isLoading ? (
            <LoadingSkeleton count={8} height="h-28" />
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchResults ? "No messages found matching your search." : "No captures yet."}
              </p>
            </div>
          ) : (
            <>
              {displayMessages.map((msg) => (
                <MessageCard key={msg.id} message={msg} onClick={setDetailId} onReanalyze={(id) => reanalyzeMut.mutate(id)} />
              ))}
              {hasMore && (
                <div className="flex justify-center py-6">
                  <Button variant="outline" onClick={handleLoadMore} disabled={loadMoreMut.isPending}>
                    {loadMoreMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                    {loadMoreMut.isPending ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {viewTab === "images" && images && <ImagesGrid images={images} onClick={setDetailId} />}
      {viewTab === "review" && reviews && (
        <ReviewList reviews={reviews} onClick={setDetailId} onReanalyze={(id) => reanalyzeMut.mutate(id)} />
      )}

      <Dialog open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-4" /> Message Detail
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-1">
            {detailLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : detailMessage ? (
              <MessageDetailView message={detailMessage} attachments={detailAttachments} />
            ) : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```
(Note: Need to add `MessageSquare` to lucide import)

- [ ] **Step 7: Typecheck**

```bash
cd /home/code/GMW/services/frontend && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/components/messages/ src/app/\(dashboard\)/messages/page.tsx
git commit -m "refactor(frontend): extract message components from page"
```

---

### Task 5: Dashboard Feature Components

**Files:**
- Create: `src/components/dashboard/stats-section.tsx`
- Create: `src/components/dashboard/users-section.tsx`
- Create: `src/components/dashboard/user-detail-section.tsx`
- Create: `src/components/dashboard/channels-section.tsx`
- Create: `src/components/dashboard/channel-detail-section.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

Each component is extracted verbatim from the existing `dashboard/page.tsx` inline functions, preserving exact rendering. Structure same as Task 4 pattern.

- [ ] **Step 1-5: Create the 5 component files** — extract each inline section from `dashboard/page.tsx` into its own file under `src/components/dashboard/`. Each component gets:
  - Same `"use client"` directive
  - Same imports it needs
  - Same JSX (no visual changes)
  - Same props interface

- [ ] **Step 6: Simplify `dashboard/page.tsx`**

Replace with a thin composition layer that imports the 5 sections and uses the state machine pattern (view switching).

- [ ] **Step 7: Typecheck & commit**

```bash
cd /home/code/GMW/services/frontend && npx tsc --noEmit
git add src/components/dashboard/ src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "refactor(frontend): extract dashboard components from page"
```

---

### Task 6: Extract Voice / Media / Recordings / Analysis Components

**Files:**
- Create: `src/components/voice/voice-connection-card.tsx`
- Create: `src/components/voice/active-speakers-panel.tsx`
- Create: `src/components/voice/microphone-card.tsx`
- Modify: `src/app/(dashboard)/voice/page.tsx`
- Create: `src/components/media/music-player.tsx`
- Modify: `src/app/(dashboard)/media/page.tsx`
- Create: `src/components/recordings/recording-list.tsx`
- Modify: `src/app/(dashboard)/recordings/page.tsx`
- Create: `src/components/analysis/search-panel.tsx`
- Modify: `src/app/(dashboard)/analysis/page.tsx`

Same pattern as Tasks 4-5: extract inline components to separate files, simplify page files.

- [ ] **Step 1-10: Create component files for each feature**
- [ ] **Step 11: Simplify page files**
- [ ] **Step 12: Typecheck & commit**

```bash
git add src/components/voice/ src/components/media/ src/components/recordings/ src/components/analysis/ src/app/\(dashboard\)/voice/page.tsx src/app/\(dashboard\)/media/page.tsx src/app/\(dashboard\)/recordings/page.tsx src/app/\(dashboard\)/analysis/page.tsx
git commit -m "refactor(frontend): extract voice/media/recordings/analysis components"
```

---

### Task 7: Data Fetching Consistency

**Files:**
- Modify: `src/components/shared/guild-selector.tsx`
- Modify: `src/hooks/use-voice.ts`
- Modify: `src/components/chatbot/chatbot.tsx`

- [ ] **Step 1: Refactor `GuildSelector` to use hooks**

Replace manual `useState` + `useEffect` + `fetchGuilds` with `useGuilds()` and `useConfig()` hooks. Handle loading/error states the same way.

```typescript
"use client";

import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfig, useGuilds } from "@/hooks";
import type { Guild } from "@/lib/types";

export interface GuildSelectorProps {
  value: string;
  onChange: (guildId: string) => void;
  autoHide?: boolean;
}

export function GuildSelector({ value, onChange, autoHide = true }: GuildSelectorProps) {
  const { data: guilds = [], isLoading, error, refetch } = useGuilds();
  const { data: config } = useConfig();

  // Auto-select on mount
  const initDone = useRef(false);
  useEffect(() => {
    if (guilds.length === 0 || value || initDone.current) return;
    initDone.current = true;
    const preferred = config?.monitorGuildId ?? guilds[0].id;
    if (preferred) onChange(preferred);
  }, [guilds, config, value, onChange]);

  if (autoHide && guilds.length <= 1 && !isLoading && !error) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 p-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-destructive shrink-0" />
          <p className="text-sm text-muted-foreground">
            Could not load guilds: {error.message}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="size-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  if (guilds.length === 0) { /* same as current */ }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
      <Badge variant="outline" className="shrink-0 text-xs font-normal">Guild</Badge>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-8 w-full max-w-xs">
          <SelectValue placeholder="Select a guild...">
            {guilds.find((g) => g.id === value)?.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {guilds.map((g) => (
            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```
(Add `useRef`, `useEffect` and `RefreshCw` to imports.)

- [ ] **Step 2: Convert `useVoiceChannels` to React Query**

In `use-voice.ts`, replace:
```typescript
export function useVoiceChannels() {
  const [channels, setChannels] = useState<...>([]);
  ...
}
```
With:
```typescript
import { useQuery } from "@tanstack/react-query";

export function useVoiceChannels(guildId: string) {
  return useQuery<Channel[]>({
    queryKey: ["voice-channels", guildId],
    queryFn: () => voiceApi.getVoiceChannels(guildId),
    enabled: !!guildId,
  });
}
```

Then update `voice/page.tsx` where it calls `useVoiceChannels` — change from `const { channels, fetch } = useVoiceChannels()` to `const { data: voiceChannels = [], refetch: fetchChannels } = useVoiceChannels(selectedGuild)`.

- [ ] **Step 3: Refactor Chatbot to React Query**

In `chatbot.tsx`, add:
```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Inside Chatbot component:
const qc = useQueryClient();
const { data: historyMessages = [] } = useQuery({
  queryKey: ["chatbot-history"],
  queryFn: () => chatbotApi.getHistory(),
  enabled: open,
});

const sendMut = useMutation({
  mutationFn: (text: string) => chatbotApi.send(text),
  onSuccess: () => qc.invalidateQueries({ queryKey: ["chatbot-history"] }),
});

const clearMut = useMutation({
  mutationFn: () => chatbotApi.clearHistory(),
  onSuccess: () => qc.setQueryData(["chatbot-history"], []),
});
```

Replace manual `useEffect` history fetch with `historyMessages` from query.
Replace manual `handleSend` with `sendMut.mutateAsync`.
Replace manual `handleClear` with `clearMut.mutate`.

- [ ] **Step 4: Typecheck & commit**

```bash
cd /home/code/GMW/services/frontend && npx tsc --noEmit
git add src/components/shared/guild-selector.tsx src/hooks/use-voice.ts src/components/chatbot/chatbot.tsx src/app/\(dashboard\)/voice/page.tsx
git commit -m "refactor(frontend): consistent React Query data fetching"
```

---

### Task 8: Rebrand (bete/GMW → Discord Automod)

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: Any files with "bete" or "GMW" references in comments

- [ ] **Step 1: Search for "bete" and "GMW" references**

```bash
grep -rn -i "bete\|gmw" src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Update title in `src/app/layout.tsx`**

```typescript
export const metadata: Metadata = {
  title: "Discord Automod — Moderation Dashboard",
  description: "Live Discord monitoring and AI moderation dashboard",
};
```

- [ ] **Step 3: Update settings page text**

In `src/app/(dashboard)/settings/page.tsx`, the about section:
```typescript
<p><span className="text-gradient font-bold">Discord Automod</span> — Discord Moderation Watcher</p>
```

- [ ] **Step 4: Update any remaining references** in comments or labels

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/\(dashboard\)/settings/page.tsx
git commit -m "refactor(frontend): rebrand bete/GMW to Discord Automod"
```

---

### Task 9: Remove Unused shadcn/ui Components

**Files:** Various under `src/components/ui/`

- [ ] **Step 1: Find unused shadcn/ui components**

```bash
cd /home/code/GMW/services/frontend/src
for f in components/ui/*.tsx; do
  name=$(basename "$f" .tsx);
  # Skip core components that might be gitignored or infrastructure
  case "$name" in
    sidebar|button|card|input|select|tabs|dialog|badge|avatar|progress|scroll-area|skeleton|slider|separator|switch|sonner|tooltip|sheet|label|popover|command|dropdown-menu) continue ;;
  esac
  count=$(grep -r "components/ui/$name" app/ components/ hooks/ lib/ --include="*.tsx" --include="*.ts" -l 2>/dev/null | grep -v "components/ui/$name" | wc -l);
  echo "$name: $count imports";
done | sort -t: -k2 -n
```

- [ ] **Step 2: Remove components with 0 imports**

For each component with 0 imports (excluding self-imports), delete the file.

- [ ] **Step 3: Verify nothing breaks**

```bash
cd /home/code/GMW/services/frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/
git commit -m "refactor(frontend): remove unused shadcn/ui components"
```

---

## Verification

After all tasks complete:

```bash
cd /home/code/GMW/services/frontend
npx tsc --noEmit
```

Expected: No type errors.

```bash
npx next build 2>&1 | tail -20
```

Expected: Successful static export build with no warnings.

## Rollback Plan

If any step breaks the build:
1. `git log --oneline -10` to see recent commits
2. `git revert <commit>` to revert specific change
3. Or `git reset --hard HEAD~N` to roll back multiple commits
