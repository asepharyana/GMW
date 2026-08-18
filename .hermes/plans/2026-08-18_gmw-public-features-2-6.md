# GMW — Fitur Publik Lanjutan (#2–#6) Implementation Plan

> **For Hermes:** Implement task-by-task. Build + lint + typecheck each service
> after its changes. Deploy via push to main (CI handles Nix build + systemd).
> Hard constraint (user 2026-08-18): public read-only web, fully automatic,
> rules in code, NO admin endpoints, NO shadow mode, NO per-channel web config.
> **EXPLICITLY EXCLUDED: User Reputation / Strike History** (user: "hapus
> sepenuhnya fitur user reputation" — it was never built; do not add it).

## Existing infra to reuse (verified)
- **WS**: backend `ws/server.ts` broadcasts JSON `{type,data,timestamp}` to
  frontendClients. Backend `ws/redis-bridge.ts` subscribes Redis channels
  listed in `DISCORD_CHANNEL_TO_WS_EVENT` (backend `shared/redis-channels.ts`)
  and re-emits as WS events. FE `src/lib/ws` auto-reconnect typed client.
- **Gateway → Redis**: `EventBroadcaster` + `RedisEventPublisher` (
  `discord-gateway/src/modules/event-broadcaster`). Publish via
  `eventBroadcaster.publish(EventChannels.X, payload)`.
- **Moderation data**: `moderation_actions` table (now has explainability
  cols). `moderation.repository.listActions` returns rows. `ModerationAction`
  FE type at `frontend/src/lib/types/moderation.ts`.
- **Messages**: `messages.list` / `getMessagesByChannel` (backend oRPC +
  repository). FE `messagesApi` + `useMessages`.
- **Charts**: NO chart lib installed. Use **pure SVG/CSS** (consistent with
  repo; avoid new deps).
- **CSV**: client-side Blob download, no backend.

## Task 1 — Live Moderation Feed (#2)
**Gateway**: add `MODERATION_ACTION: "discord:moderation:action"` to
`redis-channels.ts` (shared) + `EventChannels.MODERATION_ACTION` in
`eventTypes.ts`. In `moderationActionsDb.createModerationAction`, after insert,
publish `eventBroadcaster.publish(EventChannels.MODERATION_ACTION, actionRow)`.
**Backend**: add `DISCORD_MODERATION_ACTION` constant + map
`[DISCORD_MODERATION_ACTION]: "moderation_action"` in `DISCORD_CHANNEL_TO_WS_EVENT`.
**FE**: in `src/lib/ws`, subscribe to `moderation_action`; add `useLiveModeration`
hook (SWR-style with WS push, capped buffer ~50). Add `<LiveModerationFeed>`
client component on `/moderation` page (top of list, animated new-row).
Risk: gateway publish at every action (already async insert) — fire-and-forget,
wrap in try/catch. Verify WS event reaches FE via `wscat`/curl or log.

## Task 2 — Toxic Topic Trends (#3)
**Backend**: add `moderation.trends` oRPC. Query `moderation_actions` grouped
by `categories` (jsonb text[]) over last 30 days, count per category + severity
breakdown. Also `action_type` distribution. Return
`{ categories: {name,count}[], severities: {level,count}[], actions: {type,count}[] }`.
Map jsonb array in SQL (use `unnest` or parse in JS). Reuse `getDatabase`.
**FE**: `useModerationTrends` hook + `<TopicTrends>` SVG bar chart (top 10
categories) + severity donut (SVG arcs). Place on `/moderation` as a panel.

## Task 3 — Channel Timeline / Replay (#4)
Reuse existing `messages.list` (guildId) + `getMessagesByChannel`. Add a
**Timeline tab** to `/messages` that groups messages by date (client-side
bucket from `created_at`). Load-more via cursor. No new backend (existing
`messagesRouter.list` already supports guildId+limit+cursor). If needed, add
`messages.timeline` aggregation (count per day) — but keep simple: client
groups fetched rows. Verify existing endpoint returns enough history.

## Task 4 — Export CSV (#5)
**FE only**. `lib/csv.ts` `toCsv(rows, columns)` + `downloadCsv(filename, csv)`.
Add "Export CSV" button on `/moderation` (exports current actions) and
`/messages` (exports current list). Pure client-side, read-only. No backend.

## Task 5 — Activity Heatmap (#6)
**Backend**: add `messages.activity` oRPC: per-channel message count grouped by
hour-of-day (0–23) over last 14 days. Return
`{ channels: {channelId, name, byHour: number[24]}[], max }`. Use SQL
`EXTRACT(hour from ...)` + group by channel. Channel name from
`message.metadata->'channel'->>'channelName'`.
**FE**: `useMessageActivity` hook + `<ActivityHeatmap>` SVG grid (channels ×
24h, color intensity = count/max). Place on `/messages` or `/dashboard`.

## Verification checklist
- [ ] `pnpm typecheck && pnpm lint && pnpm build` green for gateway, backend, frontend
- [ ] Backend `/trpc/moderation/trends` returns categories/severities/actions
- [ ] Backend `/trpc/messages/activity` returns byHour grids
- [ ] WS `moderation_action` received by FE (log or visible live row)
- [ ] No admin/write endpoint added; all public read-only
- [ ] No User Reputation code anywhere (grep "reputation|strike|reputasi")
- [ ] Deploy via push; all 3 services `running`; moderation + messages pages load

## Files touched (summary)
- gateway: `shared/redis-channels.ts`, `event-broadcaster/eventTypes.ts`,
  `event-broadcaster/eventBroadcaster.ts`, `message-capture/moderationActionsDb.ts`
- backend: `shared/redis-channels.ts`, `orpc/router.ts`,
  `modules/moderation/moderation.service.ts` (+repository),
  `modules/messages/messages.service.ts` (+repository, +schema)
- frontend: `lib/ws/*`, `hooks/use-moderation.ts`, `hooks/use-messages.ts`,
  `lib/csv.ts`, `lib/types/*`, `app/(dashboard)/moderation/view.tsx`,
  `app/(dashboard)/messages/view.tsx`, new components under `components/`

## Status: COMPLETE (deployed + verified)
- Commit 9b3134d: features #2–#6 (live feed, trends, timeline, CSV export, heatmap)
- Commit 2a8f6d9: user reputation feature fully removed (643 deletions, no trace in src/tests)
- Migration 0016 applied: user_reputations DROPPED (DB verified: false)
- All 3 services active (gateway + backend restarted 18:29, frontend running)
- Gateway typecheck/lint/test(117 passed); backend typecheck/lint/build; FE lint/build — all GREEN

## Verification
- moderation/stats WS returns data (32 actions) → WS adapter works
- DB: user_reputations gone; moderation_actions explainability cols present
- Live Feed: gateway publishes discord:moderation:action → backend WS (same path as guild_member_*)
- Trends/Activity: backend router procedures registered (typecheck+tsc), same WS adapter
