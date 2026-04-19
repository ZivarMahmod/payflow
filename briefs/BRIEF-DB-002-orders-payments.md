# BRIEF-DB-002: orders_cache + payments schema
Thinking: 🟡 Think

## Mål
Lägg till schema för cache av öppna notor från POS:en + payments som vi förmedlar.

## Kontext
- `orders_cache` är CACHE — sanningen ligger i POS:en. Vi skriver ALDRIG till den utöver att markera betald/synca från POS.
- `payments` är vår egen tabell — våra förmedlade transaktioner.
- Detta är INTE ett kassaregister. Inga kvittonummer, ingen moms-uppdelning, ingen Z-rapport. POS:en gör allt det.

## Berörda filer
- `packages/db/supabase/migrations/003_orders_payments.sql`
- `packages/db/src/database.types.ts` (regenererad)

## Steg
1. Skapa `003_orders_payments.sql`.
2. Tabell `orders_cache`:
   - id (uuid PK)
   - restaurant_id (fk cascade)
   - location_id (fk)
   - table_id (fk nullable)
   - pos_order_id (text not null) — id i POS:ens system
   - pos_type (text) — 'onslip' | 'caspeco' | 'lightspeed'
   - order_token (text unique not null default encode(gen_random_bytes(16), 'hex')) — public token för gäst-URL
   - total (numeric(10,2))
   - currency (text default 'SEK')
   - items (jsonb) — cachad items-lista
   - status (text check in ('open','paying','paid','closed'))
   - opened_at, last_synced_at, paid_at, created_at, updated_at
   - UNIQUE (restaurant_id, pos_order_id, pos_type)
3. Tabell `payments`:
   - id, order_cache_id (fk), restaurant_id (för RLS)
   - amount (numeric(10,2))
   - tip_amount (numeric(10,2) default 0)
   - method (text check in ('swish','card'))
   - provider (text) — 'swish' | 'stripe'
   - provider_tx_id (text)
   - status (text check in ('pending','completed','failed','expired','refunded'))
   - paid_at, created_at, updated_at
4. Tabell `payment_splits` (vid split):
   - id, payment_id (fk cascade), guest_identifier (text nullable), amount, created_at
5. Index:
   - orders_cache(restaurant_id, status)
   - orders_cache(order_token)
   - orders_cache(pos_order_id, pos_type)
   - payments(order_cache_id)
   - payments(status, created_at)
6. RLS enligt SC-001-mönster.
7. RPC `get_order_by_token(token text)` — anon-säker, returnerar order + items + restaurant-info (filtrerad).
8. Updated_at-triggers.
9. Regenerera typer.
10. Commit: `feat(db): orders cache + payments`.

## Verifiering
- [ ] Tre tabeller finns med korrekt RLS.
- [ ] get_order_by_token funkar för anon-roll.
- [ ] order_token är globalt unik.
- [ ] Försök INSERT samma (restaurant_id, pos_order_id, pos_type) → constraint violation.
- [ ] Typer regenererade.

## Anti-patterns
- ALDRIG FLOAT för pengar — NUMERIC(10,2).
- Räkna ALDRIG om totals client-side — vi tar dem som de är från POS.
- order_token får ALDRIG vara förutsägbar.
- Skapa ALDRIG receipt_number-kolumn — POS:ens ansvar.

## Kopplingar
Beror på: SC-001.

## Rollback
Ta bort migration, db reset.
