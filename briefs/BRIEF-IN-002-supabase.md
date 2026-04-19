# BRIEF-IN-002: Supabase + lokal dev-miljö
Thinking: 🟢 Normal

## Mål
Skapa Supabase-projekt på cloud + sätt upp lokal Supabase via Docker. Inget schema ännu.

## Kontext
Supabase är vår enda persistens. Vi lagrar:
- Restauranger (våra kunder)
- Bord (för QR-koder)
- POS-credentials (krypterat i Vault)
- Cache av öppna notor från POS:en
- Betalningar vi förmedlat
- Reviews

Vi lagrar **INTE**: kvitton, momsdetaljer, dagsavslut, bokföring. Det äger POS:en.

## Berörda filer
- `packages/db/package.json`
- `packages/db/supabase/config.toml`
- `packages/db/supabase/migrations/` (tom)
- `packages/db/README.md`
- `apps/api/.env.example`

## Steg
1. På supabase.com: skapa projekt `flowpay-prod`, region `eu-north-1` (Stockholm).
2. Spara Project URL, anon key, service_role key i lösenordshanterare. ALDRIG i repo.
3. Skapa `packages/db`, `pnpm init` där.
4. `pnpm add -D supabase` i packages/db.
5. `npx supabase init` (skapar config.toml).
6. `npx supabase start` (kräver Docker — startar lokal stack).
7. Verifiera: Supabase Studio på http://localhost:54323.
8. Skapa `apps/api/.env.example` med:
   ```
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_KEY=
   ```
9. README i packages/db: `pnpm db:start`, `pnpm db:stop`, `pnpm db:reset`.
10. Commit: `chore(db): supabase local dev setup`.

## Verifiering
- [ ] `npx supabase start` startar utan fel.
- [ ] Supabase Studio öppnas, visar tom `public`.
- [ ] Cloud-projekt nåbart från lokal IDE.
- [ ] `.env.example` committad, `.env` gitignored.

## Anti-patterns
- ALDRIG riktiga keys i repo — endast `.example`.
- ALDRIG custom schema (corevo, flowpay etc) — alltid `public`.
- Hoppa INTE över lokal setup — migrations testas lokalt först.

## Kopplingar
Beror på: IN-001.

## Rollback
- Ta bort cloud-projektet i Supabase dashboard.
- `npx supabase stop` lokalt.
