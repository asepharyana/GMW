# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The reader is the guild's own membership, and access is public — anyone who can
reach the deployment can read the whole dashboard, not a signed-in moderation
team. There is no login, no session and no role, by deliberate decision: GMW is
single-tenant and gating is a deployment concern handled at the reverse proxy,
not a product feature. The file-based route guard in
`apps/frontend/src/routes/_authenticated.tsx` is structurally present and
deliberately empty, holding the shape for the day a guard is genuinely needed
without implying one exists.

Two jobs follow from a public reader, and they are not the same job:

- **Check that moderation is actually working.** Health of the queue, what got
  deleted, whether the enforcer is alive. Someone scanning, not working a queue.
- **Find out why *my* message was deleted.** A member whose post disappeared
  needs the message text, the policy clause it was judged against, and the
  reason — enough to judge the decision, and to appeal it.

The operator who deploys GMW is also a reader of it, but they are not the primary
audience. Design work optimises for the member asking "was that really against
the rules?"

## Product Purpose

GMW is a self-hosted watcher for one Discord guild. It captures every message
and the evidence around it, judges each one against a written policy with an
LLM, deletes what violates that policy, and shows the whole thing on a
dashboard.

Success means the guild's members can see that moderation is happening, can see
what it decided, and can see why — so that an automated deletion is an
answerable decision rather than an unexplained one.

## Positioning

**Every deletion carries its evidence and its reasoning, so the decision is
auditable and appealable.**

A verdict of `deleted` requires a non-empty `verdicts.reason`, and the captured
context around the message (edits, embeds, link previews, attachments, the
channel's own name and topic) is stored alongside it. That is the claim a
neighbouring moderation bot cannot truthfully copy, and it is the reason a
public reader is safe: exposing the queue to the public is only defensible
because nothing in it is unexplained.

## Operating Context

- One Node process runs everything: the HTTP/oRPC dashboard, the Discord
  capture, and the moderation worker (`apps/backend/src/index.ts`).
- One PostgreSQL database and one Redis. Redis is the event bus — capture
  publishes to it, the WebSocket server republishes to the browser.
- Three destinations: `/dashboard`, `/messages`, `/moderation`. `navItems` in
  `apps/frontend/src/libs/navigation.ts` is the single source of truth for the
  desktop rail, the mobile dock and the command palette.
- Auto-delete has no dry-run and no disable switch. It is gated by confidence
  threshold, allow/exclude category and channel/user lists, and evidence rules
  instead: an `error` verdict is never eligible, and a message whose sender
  suppressed embeds is never deleted at any confidence.
- Deployment is CI-driven on push to `main`, behind nginx on `4009`.

## Capabilities and Constraints

Confirmed constraints future work must preserve:

- **No auth, single tenant, one guild.** Gated by the reverse proxy at the
  deployment layer. This is a decision, not a missing feature — do not design
  around an assumed login, and do not "fix" the empty route guard.
- **`ai_status` and `verdicts.status` are two different questions.** A consumer
  needing "judged clean" versus "not judged yet" must join `verdicts`.
  Filtering on `ai_status` for a judgement reads the wrong column and returns
  nothing.
- **There is no severity tier and no review tier.** `verdicts.status` *is* the
  decision: `clean` | `deleted` | `error`. `error` means the model could not
  read the message; it never authorises a deletion.
- **`moderation_actions` is the record of what the bot did** — not
  `messages.deleted_at`, which also fires for moderator deletions.
- **Capture must never wait on the model.** A message is queued by being
  written to Postgres as `pending`; the worker claims rows under a time-boxed
  lease. This is architectural, not a UI concern, and it is the reason the
  dashboard can render queue state honestly.
- **The dashboard must never hide an outage.** The HTTP surface starts first and
  a capture or worker failure is logged, not fatal. A dead dashboard would hide
  the fact that moderation is dead.
- Two columns with different meanings in the UI: queue position versus
  verdict. Any surface that flattens them into one "status" is wrong.

Explicitly undecided, recorded rather than invented:

- **Language and locale.** The code uses `Intl.NumberFormat("id-ID")`
  throughout and `package.json` describes a "Bete GMW" frontend, which suggests
  Indonesian-language UI. This was *not* confirmed as a durable commitment, so
  it is not binding. Confirm before any new copy, locale-aware formatting, or
  RTL/typography work.
- **Whether the public reader can ever see message *content*,** or only
  verdicts and metadata. Today reads are public and `EXCLUDED_CHANNEL_IDS`
  exists, but the intended line has not been stated.
- Whether a member-facing appeal or dispute path is a goal, or the dashboard is
  read-only transparency by intent.

## Brand Commitments

- The name **GMW — Guild Moderation Watcher** is established. `Bete GMW`
  appears as the frontend's package description.
- No auth and single-tenancy are deliberate commitments, not a roadmap gap.

## Evidence on Hand

- A real production guild is behind this: real captured messages, real verdicts,
  real deletions, and a weekly moderation digest is generated from them.
- `README.md` at the repo root is substantial, current product documentation
  and is treated as authoritative for architecture and data-path questions.
- An established visual system exists in `apps/frontend/src/styles.css`
  ("Signal Desk" — type-led, ruled sections instead of cards, one lime
    highlighter accent), with tokens, a `@shadcn/lint` design gate
  (`pnpm run lint:design`) and documented non-negotiables.

Future work must not fabricate: testimonials, customer names, benchmark numbers,
pricing, licensing terms, or comparative accuracy claims against other bots. No
evidence of comparative accuracy exists, so no surface may imply one.

## Product Principles

1. **A decision without a reason is a bug.** Every deletion is answerable to the
   member whose message it was, in the terms of the policy that produced it.
2. **Expose the queue; the reader has nothing to hide.** The audit trail is the
   product, not an internal debug view. Transparency is what makes automation
   acceptable.
3. **Never let a view imply a healthier system than the data supports.** Live
   queue state is shown as it is, including the `unknown` state — a socket with
   no payload is not a healthy socket.
4. **Answer "why" before "how many".** A count tells a member nothing about
   their own deletion; the evidence behind one decision is worth more than every
   aggregate on the page.
5. **One source of truth per fact.** `navItems` for navigation, `ai_status` for
   queue, `verdicts.status` for decisions, `moderation_actions` for enforcement.
   A surface that derives the same thing twice will eventually show it twice.

## Accessibility & Inclusion

No product-specific accessibility requirement was established beyond the
existing implementation's baseline. Two audience facts should shape future work:
the reader is the general public rather than a trained moderation team, so
jargon like "ai_status", "verdict" or "lease" needs plain-language framing; and
`id-ID` number formatting, if it is confirmed as intentional, must be treated as
a localisation requirement rather than a bug to be corrected.