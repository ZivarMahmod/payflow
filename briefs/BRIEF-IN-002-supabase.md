# BRIEF-IN-002: Supabase + dev-miljö (cloud-first)
Thinking: 🟢 Normal

## Mål
Koppla upp `packages/db` mot Supabase Cloud (flowpay-prod). Ingen lokal Docker
krävs — Zivar har Supabase Pro-plan, vi använder molnet som dev-miljö.
Inget schema ännu (det kommer i DB-001).

## Kontext
Supabase är vår enda persistens. Vi lagrar:
- Restauranger (våra kunder)
- Bord (för QR-koder)
- POS-credentials (krypterat i Vault)
- Cache av öppna notor från POS:en
- Betalningar vi förmedlat
- Reviews

Vi lagrar **INTE**: kvitton, momsdetaljer, dagsavslut, bokföring. Det äger POS:en.

**Designval:** Vi hoppar `supabase start` (Docker lokalt) och kör direkt mot
cloud-instansen. Skälen:
- Zivar har Pro-plan redan, det är också prod-miljön.
- Den schemalagda agenten har ingen Docker i sandboxen.
- Migrations går att testa mot en branch/schema utan lokal stack.
- En miljö mindre att underhålla.

## Berörda filer
- `packages/db/package.json`
- `packages/db/supabase/config.toml` (genereras av `supabase init`)
- `packages/db/supabase/migrations/` (tom, fylls i DB-001)
- `packages/db/README.md`
- `apps/api/.env.example` (placeholder-variabler, utan värden)
- Root `.env.example` uppdateras med SUPABASE_*-rader.

## Steg
1. **Manuellt (Zivar):** Skapa projekt `flowpay-prod` på supabase.com,
   region `eu-north-1` (Stockholm). Starkt DB-lösenord.
2. **Manuellt (Zivar):** Från Settings → API, notera Project URL, anon key,
   service_role key. Klistra in i chat med Claude i Cowork — sparas i
   `.agent/secrets.env` (gitignored, aldrig committad).
3. `cd packages && mkdir db && cd db`.
4. `pnpm init` → sätt `"name": "@flowpay/db"`, `"private": true`.
5. `pnpm add -D supabase` (lägger till Supabase CLI som dev-dep).
6. `npx supabase init` → skapar `supabase/config.toml` + katalogstruktur.
7. Länka till cloud-projektet (schemalagda agenten kan inte göra detta —
   kräver interaktiv auth): Zivar kör `npx supabase login` en gång, sen
   `npx supabase link --project-ref <project-ref>` i `packages/db`.
8. Verifiera att `packages/db/supabase/config.toml` har korrekta värden
   (project_id, region = "eu-north-1").
9. Uppdatera `apps/api/.env.example`:
   ```
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_KEY=
   ```
10. README i `packages/db` beskriver: `pnpm db:push` (deploya migrations),
    `pnpm db:pull` (hämta schema från cloud), `pnpm db:diff` (diff lokalt
    vs cloud). Alla pekar på cloud — inga `db:start/stop/reset`.
11. Commit: `chore(db): supabase cloud-first dev setup (no local Docker)`.

## Verifiering
- [ ] `packages/db/supabase/config.toml` existerar, project_id satt.
- [ ] `npx supabase projects list` (från Zivars maskin) visar `flowpay-prod`.
- [ ] Cloud-projektet nåbart: `curl -s $SUPABASE_URL/rest/v1/ -H "apikey: $SUPABASE_ANON_KEY"` svarar med JSON.
- [ ] `.env.example` committad; `.env` och `.agent/secrets.env` gitignored.
- [ ] Root `.env.example` har SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY.

## Anti-patterns
- **ALDRIG riktiga keys i repo** — endast `.example`.
- **ALDRIG** custom schema (corevo, flowpay etc) — alltid `public`.
- Kör **INTE** `supabase start` (kräver Docker). Vi är cloud-only.
- Kör **INTE** `supabase db reset` mot cloud (destructive).

## Kopplingar
Beror på: IN-001.

## Rollback
- Ta bort cloud-projektet i Supabase dashboard.
- `rm -rf packages/db` lokalt.

## Anteckningar för agenten
- Stegen 1, 2, 7 måste Zivar göra (kräver webbläsare/interaktiv auth).
- Steg 3-6, 8-11 kan agenten göra när credentials finns i `.agent/secrets.env`.
- Om `SUPABASE_SERVICE_KEY` saknas i env — markera brief som `blocked` med
  tydlig "Vad jag behöver från Zivar"-sektion.
