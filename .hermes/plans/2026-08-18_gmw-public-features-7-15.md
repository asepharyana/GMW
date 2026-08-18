# GMW — Fitur Publik Lanjutan #7–#15 + Bug Fix Reputation Removal

> **For Hermes:** Implement task-by-task. Build + lint + typecheck each service after its
> changes. Deploy via push to main (CI handles Nix build + systemd). Apply any new
> drizzle migration MANUALLY (systemd does NOT run migrations).
> Hard constraint (user): public read-only web, fully automatic, rules in code,
> NO admin endpoints, NO shadow mode, NO per-user reputation aggregation.

## Bug fix discovered during planning (MUST do first)
`services/backend/src/modules/dashboard/dashboard.repository.ts` still references
`pgUserReputationsTable` (import line 8; JOINs at lines 173 + 457) — that table was
DROPPED in migration `0016`. `dashboard.listUsers` / `dashboard.userDetail` will
**crash at runtime** (undefined table). Remove the import + the `r.*` join columns
(`trust_score`, `clean_message_streak`, `total_infractions`) from both queries.
This is a regression introduced by the reputation removal commit.

## Features to implement (#7–#15)
All reuse existing infra: `moderation_actions`, `messages`, `channel_cultures`,
`term_glossary_cache`, `ai_analysis_runs`, `message_edits`, gateway cron (for #15),
WS (proven Live Feed pattern), oRPC over WS (proven), pure-SVG charts (no libs).

| # | Feature | Data source | Surface |
|---|---------|-------------|---------|
| 7 | Flagged Link / Scam Domain Reporter | regex URL from `moderation_actions.content`/`evidence` | `/moderation` |
| 8 | Top Flagged Channels | join `moderation_actions.message_id`→`messages.channel_id` | `/moderation` |
| 9 | Moderation Heatmap by Hour | `moderation_actions.created_at` hour-of-day | `/moderation` |
| 10 | Flag Category Drill-down | `moderation_actions.categories` (reuse Trends) | `/moderation` FE-only |
| 11 | Channel Culture Glossary | `channel_cultures` (exists) | new `/channels` panel |
| 12 | Term Knowledge Base | `term_glossary_cache` (exists) | new `/glossary` panel |
| 13 | Edit/Evasion Tracker | `message_edits` (exists) | `/messages` |
| 14 | Auto-mod Coverage Stats | `ai_analysis_runs` (exists) | `/moderation` metric tiles |
| 15 | Weekly Digest (auto, cron) | aggregate #7/#8/#9 → Discord via gateway cron | gateway cron + `/moderation` |

## Architecture per layer

### Backend (oRPC, `services/backend/src`)
- New repository methods (add to existing repos, follow `getTrends` SQL style):
  - `moderation.repository.ts`:
    - `getTopFlaggedDomains(days)` — `regexp_matches(content,'https?://([^/\s]+)')` on
      `moderation_actions WHERE created_at>=since`, group by host, COUNT, order DESC LIMIT 20.
    - `getTopFlaggedChannels(days)` — join `moderation_actions a` LEFT JOIN `messages m`
      ON `m.id=a.message_id`, group by `m.channel_id`, COUNT, order DESC LIMIT 15.
      Channel name via `m.metadata::jsonb->'channel'->>'channelName'`.
    - `getHourlyModeration(days)` — `EXTRACT(HOUR FROM to_timestamp(created_at/1000))`
      group by hour, COUNT, severity breakdown. (24 rows)
    - `getFlaggedByCategory(days, category)` — list actions where `categories` contains
      `category` (reuse `listActions` filter or new query), for drill-down #10.
    - `getCoverage(days)` — from `ai_analysis_runs`: total runs, status breakdown
      (clean/flagged/warn/error/pending), coverage % = (analyzed)/(captured in window).
  - `dashboard.repository.ts` (or new `knowledge.repository.ts`):
    - `listChannelCultures(limit, search?)` — `channel_cultures` rows (channel_id,
      guild_id, channel_name from messages metadata, culture_summary, last_analyzed_at).
    - `listGlossary(limit, search?)` — `term_glossary_cache` (term, definition, source_url,
      resolved_at, hit_count) order by hit_count DESC.
  - `messages.repository.ts`:
    - `getEditHistory(limit, channelId?)` — `message_edits` join `messages` for
      old_content + channel + username + edited_at, order DESC LIMIT.
- `moderation.service.ts` / `dashboard.service.ts` / `messages.service.ts`: thin wrappers.
- `orpc/router.ts`: add procedures (follow `trends` shape):
  - `moderation.topDomains`, `moderation.topChannels`, `moderation.byHour`,
    `moderation.byCategory` (input `{days,category}`), `moderation.coverage`.
  - `dashboard.channelCultures`, `dashboard.glossary`.
  - `messages.editHistory`.

### Frontend (`services/frontend/src`)
- `lib/types/moderation.ts`: add `FlaggedDomain`, `FlaggedChannel`, `HourlyModeration`,
  `ModerationCoverage` interfaces.
- `lib/types/index.ts` (+ message.ts): add `ChannelCultureRow`, `GlossaryRow`, `EditHistoryRow`.
- `lib/api/moderation.ts`: add `topDomains`, `topChannels`, `byHour`, `byCategory`, `coverage`.
- `lib/api/dashboard.ts` (or messages.ts): add `channelCultures`, `glossary`, `editHistory`.
- `lib/api/server.ts`: add SSR seed fetchers (follow `getModerationStats`).
- `hooks/use-moderation.ts`: add `useTopDomains`, `useTopChannels`, `useHourlyModeration`,
  `useByCategory`, `useCoverage`. `hooks/use-dashboard.ts`/`use-messages.ts`: add culture/glossary/edit hooks. `hooks/index.ts`: export all.
- New components (pure SVG/CSS, reuse `GlassPanel`/`SectionHeader`/`Badge`/`Donut`):
  - `components/ScamDomains.tsx`, `components/TopChannels.tsx`, `components/ModerationHeatmap.tsx`,
    `components/CoverageTiles.tsx`, `components/ChannelCultureGlossary.tsx`,
    `components/TermGlossary.tsx`, `components/EditHistory.tsx`.
- Wire into `app/(dashboard)/moderation/view.tsx` (grid col-span-2/3/5 as space allows)
  and `app/(dashboard)/messages/view.tsx` (EditHistory panel) and new route pages
  `app/(dashboard)/channels/page.tsx` + `app/(dashboard)/glossary/page.tsx` with
  matching `view.tsx` (follow existing page→view SSR pattern; check `app/(dashboard)/dashboard/page.tsx`).
- Export CSV buttons reuse `lib/csv.ts` `downloadCsv` (client-side) for domains/channels/edits.

### Gateway (#15 Weekly Digest)
- Add a cron/interval in `services/discord-gateway` (check existing scheduler pattern —
  search `setInterval`/`cron` in `src`). On a 7-day cadence, query backend oRPC
  (`dashboard.activity`, `moderation.trends`, `moderation.topChannels`) — OR compute
  directly via a shared repository — and post a formatted summary to the monitor guild
  channel (via existing `discordClient.channels.send` helper). Fully automatic, no UI.

## Files touched (summary)
- backend: `modules/moderation/{repository,service}.ts`, `modules/dashboard/{repository,service}.ts`,
  `modules/messages/{repository,service}.ts`, `orpc/router.ts`, `shared/index.ts` (if new tables),
  `lib/types/*` (FE)
- frontend: `lib/api/*`, `lib/types/*`, `hooks/*`, `components/*`, `app/(dashboard)/*`
- gateway: new digest scheduler + (none if reuse backend) maybe `shared/redis-channels.ts`

## Constraints / pitfalls (from gmw-ops skill)
- `created_at` is bigint epoch-MS — compare with `<`/`>`, do NOT divide by 1000 in SQL.
- Pure SVG only — frontend has ZERO chart libs.
- `Badge` Tone = signal|amber|vermilion|neutral (no "rose").
- Frontend WS import is `@/lib/ws/context`; method `on` not `subscribe`.
- Commit author `asepharyana`, no Co-Authored-By.
- Rebuild `dist/` after gateway changes; apply drizzle migrations manually.

## Verification
- Per service: `pnpm typecheck && pnpm lint && pnpm build` green.
- Gateway: `pnpm test` (117+ pass).
- Live: `moderation/stats` WS returns data (proves adapter); new procedures registered
  (typecheck = proof). `systemctl show` new ActiveEnterTimestamp after deploy.
- DB: confirm `channel_cultures`/`term_glossary_cache`/`message_edits`/`ai_analysis_runs`
  have rows before relying on them (some may be empty → components handle empty state).

## Execution order
1. Bug fix dashboard.repository (reputation JOIN) — deploy-safe.
2. Backend repositories + service + router (#7,#8,#9,#14 dashboard; #11,#12; #13).
3. FE types + api + hooks + components + wire (#7,#8,#9,#10,#11,#12,#13,#14).
4. Gateway #15 digest (if scheduler exists) — verify via log, not UI.
5. Build/lint all 3 services; commit; push; monitor CI; apply migrations; verify live.
