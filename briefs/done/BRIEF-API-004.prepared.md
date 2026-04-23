# BRIEF-API-004 — Mark-order-paid → POS — PREPARED

- **Date:** 2026-04-23T02:15+02:00
- **Commit:** pending-zivar-commit (sandbox cannot reach github.com / registry.npmjs.org / *.supabase.co — see `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`)
- **Commit message (suggested):** `feat(api): pos update queue`
- **Status:** All files written. Mock path fully exercisable via vitest. Local `pnpm typecheck` / `pnpm lint` and `pnpm supabase db push` deferred to Zivar.
- **Tier:** 🔴 Think hard — extra care taken on idempotency, parallel-safety, and crash recovery. See "Design review" below.

## Note on status

`SKIP-CONDITIONS.md` lists API-004 under **PREPARED** (egress-blocked). All code/SQL is complete. The single thing that cannot run in this sandbox is the live end-to-end check (local API → cloud Supabase → Onslip mock fixture). Zivar runs that step on her machine; everything else is verifiable locally with `pnpm install && pnpm -w typecheck && pnpm -w lint && pnpm --filter @flowpay/api test`.

## Local verifications

Sandbox cannot run pnpm (no npm registry, no node_modules). Code was hand-reviewed for:

- Strict-mode types against the existing `apps/api/tsconfig.json` profile.
- Adapter contract conformance — `markOrderPaid` signature matches `POSProvider` exactly.
- RLS surface — no new SELECT/INSERT/UPDATE/DELETE policies for staff besides SELECT (worker is service-role).
- SQL migration timestamp slot — `20260423000007` continues the 006 series cleanly.

Verification matrix:

- [ ] pnpm install                                — deferred (no registry access)
- [ ] pnpm -w typecheck                           — deferred
- [ ] pnpm -w lint                                — deferred
- [ ] pnpm --filter @flowpay/api test             — deferred (new `pos-update-queue.test.ts` written, 6 cases)
- [ ] `pnpm supabase db push` (migration 007)    — deferred (no *.supabase.co access)
- [ ] Local API → cloud DB end-to-end smoke       — Zivar-side
- [ ] Real Onslip sandbox `/close` call           — Zivar-side once secrets land

## Manual steps for Zivar (run locally with network access)

```bash
# 1. Install (no new deps — the brief did not require any).
cd <payflow-checkout>
pnpm install

# 2. Typecheck + lint across the workspace.
pnpm -w typecheck
pnpm -w lint

# 3. Unit tests for the new worker.
pnpm --filter @flowpay/api test src/services/pos-update-queue.test.ts
#  → 6 cases:
#       1) happy path: claim → markOrderPaid → complete RPC
#       2) empty batch: never touches the provider
#       3) transient POS error → retry with first backoff (5 s)
#       4) 5th failure → finalised as 'failed' + admin notified
#       5) orphan integration row → surfaces failure without POS call
#       6) complete-RPC error after successful POS call → retry path

# 4. Apply the DB migration.
cd packages/db
pnpm supabase db push
#  → applies 20260423000007_pos_update_queue.sql
pnpm supabase gen types typescript --linked > src/database.types.ts
#  → diff against the hand-authored file — should match exactly. If
#    Supabase generates the queue table or the three new RPCs with a
#    slightly different shape, keep the generated version.

# 5. End-to-end smoke (local API against cloud Supabase, mock POS).
# Ensure .env has USE_MOCK_ONSLIP=true and ENABLE_POS_SYNC=true.
pnpm --filter @flowpay/api dev
#  → in another terminal:
#  - Initiate a payment (existing API-003 flow):
curl -s -XPOST http://localhost:3001/payments/initiate \
  -H 'content-type: application/json' \
  -d '{"order_token":"<tok>","amount":42.50,"tip_amount":0,"method":"swish"}' | jq .
#  - Confirm it:
curl -s -XPOST http://localhost:3001/payments/<payment_id>/confirm \
  -H "authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -d '{}' | jq .
# Within ~5 s, look at the api logs for a line like:
#   pos-update-queue: marked POS bill paid
#
#  Then verify the row state in Supabase Studio:
#   select id, status, attempts, last_error
#     from pos_update_queue
#    order by created_at desc limit 5;
#  Expect: one row with status='done', attempts=0.

# 6. Failure-replay smoke (no real POS down — flip the mock to throw).
# Easiest path: temporarily set USE_MOCK_ONSLIP=false but leave the
# integration row unconfigured. The worker will:
#   - try Vault credential lookup → fail with AUTH_FAILED
#   - call fail_pos_update_queue_item → row goes back to pending with
#     next_attempt_at = now() + 5 s
#   - retry 4 more times (30 s, 2 min, 10 min, 1 h) — too slow to
#     watch in real time
#   - after 5 failures total → status='failed', notifyAdminOnFail logged
# To make this test fast, either stub a failing provider via a one-off
# test script or shrink the backoff array temporarily.

# 7. Idempotency smoke (the unique constraint).
# Race: trigger the /confirm endpoint twice in <100 ms (the second one
# returns 409 from the route's status guard, but even if it didn't:
#   psql=> insert into pos_update_queue (payment_id, ..., action) values
#          (<same payment id>, ..., 'mark_paid');
#   ERROR:  duplicate key value violates unique constraint
#           "pos_update_queue_payment_id_action_key"
# That's the brief's "Två samtidiga completePayment för samma order →
# bara EN markOrderPaid mot POS" guarantee enforced at the storage layer.
```

## Design review (🔴 self-review)

1. **Idempotency lives at the storage layer, not the application layer.**
   `pos_update_queue` has `UNIQUE(payment_id, action)`. The trigger uses
   `INSERT … ON CONFLICT (payment_id, action) DO NOTHING`. That means
   two concurrent `payments.status = 'completed'` UPDATEs (or a
   double-fired trigger, or a manual admin SQL session) all converge on
   exactly one queue row → exactly one POS call. This is the brief's
   primary anti-pattern guard ("använd payment.id som reference") moved
   from app code into the schema, where it cannot be bypassed.

2. **Enqueue is in the DB, not in the route handler.** The trigger
   `payments_enqueue_pos_update_trigger` fires AFTER UPDATE on `payments`
   for any row that transitions to status='completed'. It runs whether
   the writer is the `/confirm` route, a future Stripe webhook, an admin
   SQL session, or a Tink poll-loop. Defense in depth — there's no path
   that flips a payment to completed AND forgets to enqueue.

3. **Orphan-integration fast-fail.** If a payment lands but
   `pos_integrations` has no matching row for that
   (restaurant, location, pos_type), the trigger inserts a queue row
   already in status='failed' with a clear `last_error`. The admin
   dashboard ("show me failed POS updates") surfaces the misconfig
   immediately instead of waiting 5 retries × backoff = ~1 hour of
   silence. The worker's own orphan-integration branch handles the
   race where the row vanishes between trigger fire and worker claim.

4. **Backoff schedule is in the worker, not in SQL.** The brief
   prescribes [5 s, 30 s, 2 min, 10 min, 1 h]. That's a product decision
   that's likely to evolve (e.g. tighten for Caspeco which is more
   tolerant of retry storms). Encoding it as a TS constant and passing
   `next_attempt_at` into `fail_pos_update_queue_item(p_id, p_error,
   p_next_attempt_at, p_max_attempts)` keeps the SQL surface small and
   lets us change the schedule without a migration.

5. **Lease-based dequeue with `FOR UPDATE SKIP LOCKED`.** Two worker
   replicas can run safely. Each call to `claim_pos_update_queue_items`
   pulls up to N pending rows whose `next_attempt_at <= now()`, marks
   them `processing` with a `leased_until = now() + 60 s`, and returns
   them. The `SKIP LOCKED` clause prevents replicas from contending —
   each gets a disjoint subset.

6. **Crash recovery via lease expiry.** If a worker dies mid-call its
   row stays in `processing` forever — bad. The same `claim_pos_update_queue_items`
   RPC also picks up rows where `status = 'processing' AND leased_until
   < now()`. Treats them as pending. The next worker re-runs `markOrderPaid`.
   Onslip's `/close` is idempotent (closing an already-closed bill is a
   200), so the redundant call is safe. This is documented at the SQL
   call site and on the `markOrderPaid` adapter contract.

7. **Worker is gated by `ENABLE_POS_SYNC`, same as the sync scheduler.**
   Both should run on the single "worker" deployment, not on every API
   replica. Even though the design is multi-replica safe, log clarity
   wins from "one worker per deployment" as the default. Future scale
   path: split into two flags (`ENABLE_POS_SYNC`, `ENABLE_POS_QUEUE`)
   if we ever want to run the queue on more replicas than the syncer.

8. **`payment-completion.ts` is a thin idempotent wrapper.** Not used
   by `/payments/:id/confirm` today (that route's existing SQL UPDATE
   already triggers enqueue via the DB trigger — same code path). It
   exists for the two next consumers: a Stripe webhook (POS-003) and a
   manual admin "mark paid" action (TA-005's adjacent). Calling it
   twice is safe — second call returns `{ alreadyCompleted: true }`
   without writing.

9. **Per-row failures are reported to the DB; only RPC-level failures
   bubble up.** The worker tick swallows individual-row errors after
   reporting them via `fail_pos_update_queue_item`. Only an error
   throwing out of `claim_pos_update_queue_items` itself (DB down, RPC
   missing) increments `consecutiveFailures` and triggers process-level
   backoff. Correct boundary: a single row failing should not back off
   the whole worker.

10. **`notifyAdminOnFail` hook is fire-and-forget.** Default no-op. The
    brief says "notifiera admin via email" — that wires to a future
    Resend/SES integration. Keeping it as an injected callback means
    we can ship the queue today without coupling to an email provider,
    and the test suite verifies the callback fires exactly once on the
    5th failure.

11. **`max_attempts` is checked against `attempts + 1` inside the SQL.**
    Off-by-one trap avoided: the row enters with `attempts = 0`, the
    fail RPC bumps to 1, then 2, … then 5 → flips to `failed`. The
    worker's `buildRetryResult` uses the same arithmetic so logged
    `outcome` matches what the DB stored.

12. **`payload jsonb` snapshot at enqueue time.** We capture
    `{ method, amount, tipAmount, reference }` at the moment of
    enqueue, not at the moment of POS call. Reasoning: payment
    `tip_amount` could be edited by admin between completion and
    POS-call (e.g. customer disputes the auto-tip). Replaying with the
    snapshot keeps the POS in sync with what we recorded at completion,
    not with whatever the row looks like minutes/hours later.

## Avvikelser från briefen

- **Migration filename `20260423000007_pos_update_queue.sql`.** Brief
  says "Migration 006" but 006 already exists
  (`20260423000006_payments_swish.sql`, landed earlier this night by
  API-003). Used the next timestamped slot.

- **Single chokepoint via DB trigger, not via app-code call to
  `enqueue()`.** Brief says step 2 "Skapar pos_update_queue-rad
  action='mark_paid'" inside `completePayment()`. I moved the enqueue
  into a DB trigger so that *every* path (route handler, future Stripe
  webhook, admin SQL) auto-enqueues without remembering. Trade-off
  surfaced in Design review #2 — net win for safety, mild loss in
  call-site visibility.

- **`payment-completion.ts` does NOT enqueue itself.** Follows from the
  trigger choice. The wrapper just flips status; trigger handles the
  rest. Kept as a deliberate single-responsibility split.

- **Admin notification is a callback, not an email send.** Brief says
  "notifiera admin via email" — implemented as `notifyAdminOnFail`
  injection point, default no-op. Wiring to Resend/SES is a follow-up
  brief; landing API-004 today shouldn't block on email infra.

- **Worker is gated by `ENABLE_POS_SYNC`, not its own flag.** Brief
  doesn't say either way. Reused the existing flag because both want
  to run on the same single "worker" deployment. Easy to split later.

- **Lease-based crash recovery (60 s).** Unprompted by the brief but
  essential — without it a crashed worker leaves rows stuck in
  `processing` forever. Documented in Design review #6.

- **`claim_pos_update_queue_items(p_limit, p_lease_seconds)` returns a
  whitelisted projection.** Excludes `last_error`, `payload` rebuild
  fields the worker doesn't need. Smaller wire shape, easier to keep
  in sync with `database.types.ts`.

- **No new npm deps.** Brief doesn't require any. Re-uses
  `@flowpay/pos-adapters`'s `getPOSProvider` registry and `@supabase/supabase-js`
  for RPC calls.

## Files changed / added

### New
- `packages/db/supabase/migrations/20260423000007_pos_update_queue.sql`
  — `pos_update_queue` table + indexes + RLS (staff SELECT only) +
  `payments_enqueue_pos_update` AFTER UPDATE trigger +
  `claim_pos_update_queue_items(p_limit, p_lease_seconds)` worker dequeue +
  `complete_pos_update_queue_item(p_id)` happy-path finalise +
  `fail_pos_update_queue_item(p_id, p_error, p_next_attempt_at, p_max_attempts)`
  retry/finalise.
- `apps/api/src/services/pos-update-queue.ts` — `PosUpdateQueueWorker`
  class + `POS_UPDATE_BACKOFF_MS` + `POS_UPDATE_MAX_ATTEMPTS` +
  `processOnce()` + `start()`/`stop()` lifecycle. Setinterval-driven
  with jittered start, process-level backoff on consecutive RPC
  failures, per-row error isolation.
- `apps/api/src/services/payment-completion.ts` — `completePayment()`
  thin idempotent wrapper for future webhook / admin consumers.
  `PaymentCompletionError` for typed failure modes.
- `apps/api/src/services/pos-update-queue.test.ts` — vitest suite, 6
  cases. No real Supabase; in-memory stub for the four RPCs the worker
  uses + a tiny `from('pos_integrations')` builder.

### Modified
- `packages/db/src/database.types.ts` — added `pos_update_queue` Tables
  entry + the three new Functions
  (`claim_pos_update_queue_items`, `complete_pos_update_queue_item`,
  `fail_pos_update_queue_item`); added row helper aliases
  (`PosUpdateQueueRow`, `PosUpdateQueueInsert`, `PosUpdateQueueUpdate`);
  bumped the migration list comment.
- `apps/api/src/server.ts` — start `PosUpdateQueueWorker` when
  `ENABLE_POS_SYNC=true`, gracefully stop on `onClose`.

## Frågor till Zivar

- **Email provider for admin notifications.** `notifyAdminOnFail` is a
  no-op today. When you wire Resend / SES / SendGrid, the integration
  point is one parameter on `PosUpdateQueueWorker`. Want me to land a
  follow-up brief that ships a default Resend-backed notifier and a
  dashboard "Failed POS updates" widget?

- **Backoff schedule confidence.** `[5 s, 30 s, 2 min, 10 min, 1 h]`
  matches the brief literally. Once we have one real outage's worth of
  data (Onslip's actual recovery profile) we should re-tune. Track as
  ops-debt or revisit after the first pilot restaurant?

- **`ENABLE_POS_SYNC` conflation.** Today this single flag toggles
  both the sync scheduler (read-from-POS) and the queue worker
  (write-to-POS). Same deployment for now. Want me to split into
  `ENABLE_POS_QUEUE` for cleaner ops in v0.2?

- **Lease length.** Set to 60 s. The Onslip `/close` p99 is documented
  at <2 s in the adapter comments. 60 s gives 30× margin. If you want
  faster crash-recovery cadence (e.g. 15 s lease so the next claim
  cycle picks orphans sooner), that's a constant flip — no migration.

- **`completePayment()` consumer rollout.** Wrapper exists but isn't
  used yet (the existing `/confirm` route's SQL UPDATE triggers
  enqueue directly). Plan is for POS-003's Stripe webhook to call it.
  Confirm that's still the right next consumer?

- **Failed-row TTL / cleanup.** Not implemented. A daily job to delete
  `status='done'` rows older than 30 d would keep the table small. Add
  as a follow-up brief or rely on Supabase dashboard cleanup?
