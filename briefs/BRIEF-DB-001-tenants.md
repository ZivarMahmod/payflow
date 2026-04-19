# BRIEF-DB-001: Initial schema (restaurants, locations, tables, staff)
Thinking: 🟡 Think

## Mål
Skapa första migrationen med grundtabellerna för multi-tenancy. Ingen RLS i denna brief — det kommer i SC-001.

## Kontext
- En `restaurant` är en tenant.
- `tables` representerar fysiska bord — varje bord får unik `qr_token` som används i gäst-URL:en.
- `staff` är användare kopplade till restaurant med roll (owner/manager/staff).
- Använd `gen_random_uuid()` för PK.
- Alla tidsstämplar TIMESTAMPTZ.

## Berörda filer
- `packages/db/supabase/migrations/001_initial_tenants.sql`
- `packages/db/supabase/seed.sql`
- `packages/db/src/database.types.ts` (autogenererad)

## Steg
1. Skapa `001_initial_tenants.sql` med `CREATE TABLE IF NOT EXISTS`.
2. Tabell `restaurants`:
   - id (uuid PK default gen_random_uuid())
   - slug (text unique not null)
   - org_number (text)
   - name (text not null)
   - swish_number (text)
   - logo_url (text)
   - created_at, updated_at (timestamptz default now())
3. Tabell `locations`:
   - id, restaurant_id (fk cascade), address, city, postal_code, timezone (default 'Europe/Stockholm'), created_at, updated_at
4. Tabell `tables`:
   - id, location_id (fk cascade), table_number (text), qr_token (text unique not null default encode(gen_random_bytes(16), 'hex')), active (bool default true), created_at, updated_at
5. Tabell `staff`:
   - id, restaurant_id (fk cascade), user_id (fk auth.users cascade), role (text check in ('owner','manager','staff')), email, phone, created_at
6. Skapa `updated_at` trigger-funktion + triggers på de tre första tabellerna.
7. Index: restaurants(slug), tables(qr_token), staff(user_id), staff(restaurant_id).
8. seed.sql: 1 test-restaurant ('Test Bistro', slug 'test-bistro'), 1 location, 3 tables.
9. `npx supabase db reset` lokalt.
10. Generera typer: `npx supabase gen types typescript --local > packages/db/src/database.types.ts`.
11. Commit: `feat(db): initial tenant schema`.

## Verifiering
- [ ] Alla 4 tabellerna finns i `public` efter db reset.
- [ ] Seed-data syns i Supabase Studio.
- [ ] `updated_at` uppdateras automatiskt vid UPDATE.
- [ ] Migrationen är idempotent (kör 2 ggr utan fel).
- [ ] database.types.ts innehåller alla typer.

## Anti-patterns
- ALDRIG SERIAL/INT för PK — UUID alltid.
- ALDRIG TIMESTAMP utan TZ — alltid TIMESTAMPTZ.
- Glöm INTE ON DELETE CASCADE.

## Kopplingar
Beror på: IN-002.

## Rollback
- Ta bort migration-filen.
- `npx supabase db reset`.
