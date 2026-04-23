# BRIEF-DB-002 — orders_cache + payments schema — PREPARED

- **Date:** 2026-04-23T00:58+02:00
- **Commit:** pending-zivar-commit (sandbox cannot reach github.com — see `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`)
- **Status:** Files complete. Awaiting manual verification by Zivar.
- **Tier:** 🟡 Think

## Local verifications

Sandbox cannot run pnpm (no npm registry access). SQL and TS were
hand-reviewed for cross-consistency between migration, types, and the
anon RPC contract.

- [ ] pnpm typecheck  — deferred to Zivar's machine
- [ ] pnpm lint       — deferred
- [ ] pnpm db:push    — deferred (requires supabase CLI + network)

## Manual steps for Zivar (run locally)

```bash
cd packages/db
pnpm db:push                      # applies 003_orders_payments.sql
pnpm supabase gen types typescript --linked > src/database.types.ts
# Diff the regenerated file vs the hand-authored one — they SHOULD match.
# Any delta is a bug; tell me and I'll reconcile.

pnpm -w typecheck
pnpm -w lint
```

## Test scenarios (Zivar runs in Supabase SQL editor)

```sql
-- Setup (requires seed restaurants from DB-001 + SC-001).
-- As service-role:
insert into public.orders_cache (
    restaurant_id, location_id, pos_order_id, pos_type, total, status
) values (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'ONSLIP-001', 'onslip', 425.00, 'open'
) returning order_token;    -- remember the returned token

-- Uniqueness test: same (restaurant_id, pos_order_id, pos_type) → FAIL
insert into public.orders_cache (restaurant_id, location_id, pos_order_id, pos_type, total)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'ONSLIP-001', 'onslip', 100);
-- Expected: duplicate key value violates unique constraint.

-- order_token is globally unique and non-predictable (32 hex chars)
select length(order_token), order_token ~ '^[0-9a-f]{32}$'
from public.orders_cache order by created_at desc limit 1;
-- Expected: 32, true

-- Anon RPC — should work without auth
select set_config('role', 'anon', true);
select * from public.get_order_by_token('<token-from-step-1>');
-- Expected: 1 row, curated projection only (order_token, status, total,
--   currency, items, opened_at, last_synced_at, restaurant_name,
--   restaurant_slug, table_number). NO pos_order_id, NO internal ids.

-- Anon cannot SELECT the table directly
select * from public.orders_cache limit 1;
-- Expected: 0 rows (RLS filters) or permission denied.

-- Closed bills hidden from guests
update public.orders_cache set status = 'closed' where pos_order_id = 'ONSLIP-001';
select * from public.get_order_by_token('<same-token>');
-- Expected: 0 rows (RPC filters status in ('open','paying')).

reset role;

-- Payments — staff can SELECT but not INSERT (only service-role writes)
-- Impersonate an authenticated user that is staff of restaurant 1111...:
insert into public.payments (order_cache_id, restaurant_id, amount, method, provider)
values ('<order-id>', '11111111-1111-1111-1111-111111111111', 425.00, 'swish', 'swish');
-- Expected: RLS violation (no INSERT policy for authenticated).

-- But SELECT works:
select id, amount, status from public.payments;
-- Expected: returns this restaurant's payments only.
```

## Security review

1. **Anon RPC returns curated projection only.** `get_order_by_token` deliberately returns a hand-picked set of columns — `order_token`, `status`, `total`, `currency`, `items`, `opened_at`, `last_synced_at`, plus `restaurant_name`, `restaurant_slug`, `table_number`. NO `pos_order_id`, NO internal uuid, NO restaurant `org_number` or `swish_number`. A leaked token reveals the bill and restaurant name, not POS credentials or corporate identity.
2. **Only `open`/`paying` orders are visible via the RPC.** A closed or paid bill no longer resolves via its token → prevents replay attacks after payment completes.
3. **`order_token` is 32-char hex from `gen_random_bytes(16)` = 128 bits entropy.** Not guessable.
4. **`revoke all on function … from public` + explicit grants.** Anon can call the RPC, nothing else.
5. **`payments` has no staff INSERT/UPDATE/DELETE policy.** Only service-role writes (webhook handlers). Staff dashboards SELECT — that's all. Reduces the blast radius if a session token leaks.
6. **`restaurant_id` denormalised onto `payments`.** Not in the brief as an explicit step, but without it every RLS check on payments would need a join through orders_cache. The denormalisation is guarded by application code + `on delete restrict` on `order_cache_id` (can't orphan), and is the standard Supabase RLS-efficiency pattern.
7. **`payment_splits` inherits visibility through parent `payments`.** EXISTS subquery; cheap because `payments(id)` is indexed by default.
8. **Money is `numeric(10, 2)` everywhere.** Never float. `amount >= 0` check, `tip_amount >= 0`, `payment_splits.amount > 0` (splits must be positive).
9. **No `receipt_number` column anywhere.** POS owns that — confirmed. Brief explicitly forbids it.

## Avvikelser från briefen

- **`restaurant_id` on `payments` (denormalisation).** The brief lists `restaurant_id (för RLS)` — I've kept it, but flagging that this is denormalised from `orders_cache.restaurant_id`. Two mitigations: `on delete restrict` prevents orphaned payments when an order is nuked; application code must set both consistently. A later migration can add a CHECK trigger to enforce equality if Zivar wants paranoia-level tight.
- **Migration filename `20260423000003_orders_payments.sql`.** Timestamped prefix (Supabase convention) rather than `003_…` from the brief. Same pattern as DB-001 + SC-001.
- **`get_order_by_token` returns `restaurant_slug` too.** Brief says "restaurant-info (filtrerad)". Slug is useful for the gäst-PWA to show "You're at /sundbyberg" or whatever; non-sensitive.
- **`get_order_by_token` is `stable` + `security definer` + `set search_path = public`.** All three are security-standard for Supabase RPCs; brief didn't spell them out.
- **`payment_splits.amount > 0` check (strict positive).** Brief says `amount` only. A zero-kr split is meaningless and should be rejected.
- **`payments.amount >= 0` and `tip_amount >= 0` (non-negative).** Same reasoning; refunds are a separate status, not a negative amount.
- **Index `payments_restaurant_id_idx`.** Brief lists two payments indexes; a third on `restaurant_id` makes RLS-filtered dashboard queries cheap.
- **`orders_cache.currency` default `'SEK'`.** Brief says `default 'SEK'` — kept.
- **Explicit REVOKE + GRANT on the three tables.** Same pattern as SC-001; makes RLS intent unambiguous.

## Files changed

- `packages/db/supabase/migrations/20260423000003_orders_payments.sql` — new.
- `packages/db/src/database.types.ts` — extended with `orders_cache`, `payments`, `payment_splits`, shared enums (`PosType`, `OrderStatus`, `PaymentMethod`, `PaymentProvider`, `PaymentStatus`), and the `Functions` section for the three RPCs (`get_staff_restaurants`, `get_staff_role`, `get_order_by_token`). Added row helper aliases (`OrderCache`, `Payment`, `PaymentSplit`, `GuestOrderView`).

## Frågor till Zivar

- **`orders_cache.items` shape.** Brief says "cachad items-lista" as generic `jsonb`. I kept it as `Json | null`. Each POS adapter should document its own shape (Onslip vs Caspeco likely differ). The adapter layer in POS-001/POS-002 is where normalisation belongs — not in the DB. Agreed?
- **Refunds.** `status = 'refunded'` is a terminal state; do you want a separate `refunded_at` column or is `updated_at` enough? (I went with `updated_at`; the audit log later can track transitions if needed.)
- **`payment_splits` sum check.** A DB trigger enforcing `sum(splits.amount) == payments.amount` would be great but adds write complexity. I've left it as an application-layer invariant. Call it out if you want the trigger.
