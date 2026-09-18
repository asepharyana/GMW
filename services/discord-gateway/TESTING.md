# Testing — discord-gateway

Two test tiers, both in `tests/` and both run by `vitest`:

| Tier | Files | What it proves | Runs in CI | Cost |
| --- | --- | --- | --- | --- |
| **Unit** | 25 files (216 tests) | Pure logic: prompt builders, parsers, cache guards, eligibility routing, dedup, media keying | ✅ always | free |
| **E2E (live LLM)** | `tests/llmE2e.test.ts` (7 tests) | The **real** moderation prompt + **real** model produce correct verdicts end-to-end | ⏭️ skipped (no creds) | ~30s, 7 LLM calls |

## Commands

```bash
pnpm test              # everything; E2E auto-skips when creds absent
pnpm test:unit         # unit only (fast, no network)
pnpm test:e2e          # E2E only (skips if creds absent)
pnpm test:e2e:live     # E2E with live creds injected from Bitwarden (host only)
```

## What the E2E tier covers

`tests/llmE2e.test.ts` drives the exact production path:

```
buildSystemPrompt({ mode: "text" })      ← real system rules + output schema
        ↓
<messages_to_analyze> XML payload        ← same shape textBatchProcessor sends
        ↓
llmChat(...)                             ← real model via omniroute
        ↓
parseModerationResponse(raw, ids)        ← real Zod schema + severity/action derivation
        ↓
assertions on status / flags / severity / recommendedAction
```

Cases:

1. **Clean technical question** → `clean`, no `threat` flag, no delete.
2. **Physics/engineering discussion** → `clean`; guards against false-positive `threat`/`violence`.
3. **Explicit harassment + death threat** → flagged, non-empty flags.
4. **`Pecinta Pria` username + clean content** → **never delete**, never high/critical — the nickname-reset path.
5. **Sexual/provocative usernames + clean content** → never delete, never high/critical.
6. **SARA term in username only + clean content** → never delete — username is identity, not a forbidden-topic discussion.
7. **Repeated short message (`repetitions="5"`)** → spam handling stays in the warn/flag band.

### Why assertions are bands, not exact matches

Real models are non-deterministic. Pinning exact JSON would make the suite flaky and would
test the model, not the prompt. Each assertion instead encodes an **invariant the prompt
guarantees** — "username-only offense never deletes", "clean technical text is never a threat".
A regression in `prompts/rules.ts` or `prompts/output.ts` that breaks one of those invariants
fails the E2E tier.

### Flakiness handling

The `moderate()` helper retries a malformed response once, mirroring production: `llmClient`
has `DEFAULT_RETRIES = 2` and `aiAnalyzer`'s recovery worker re-analyses messages left in
`error`/`analysis_incomplete`. Observed otherwise: an occasional degenerate stream
(`results` as strings) fails Zod. Production recovers; the test retries the same way.

## Gating (why CI stays green and free)

```ts
const HAS_LLM = Boolean(process.env.AI_LLM_BASE_URL && process.env.AI_LLM_API_KEY);
const runIfLLM = HAS_LLM ? describe : describe.skip;
```

CI runs `vitest run` with no LLM env → the file reports `1 skipped`, 7 tests skipped,
zero network calls. Run locally with creds for the full signal.

## Running E2E with live credentials

```bash
pnpm test:e2e:live          # reads /etc/bws-token → bws-env gmw → AI_LLM_* vars
```

Or manually:

```bash
export AI_LLM_BASE_URL=http://<router>/api/v1
export AI_LLM_API_KEY=<key>
pnpm test:e2e
```

Do **not** add LLM credentials to CI secrets: the E2E tier calls a paid model and asserts on
non-deterministic output, so a red run would be ambiguous. It is a deliberate local/pre-release
gate; CI owns the deterministic unit tier.
