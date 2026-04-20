# BRIEF-IN-002 — Supabase + lokal dev-miljö — BLOCKED

- **Tid:** 2026-04-20T01:19:00+02:00
- **Status:** blocked, kräver Zivars lokala miljö (Docker) + Supabase-cloud-konto

## Vad jag försökte
Verifierade förutsättningar för briefen i sandboxen:

```bash
which docker        # → command not found
ls /var/run/docker.sock  # → No such file or directory
```

Sandboxen där den schemalagda agenten kör har inte Docker, och briefens
verifiering (`npx supabase start` → Studio på localhost:54323) går inte
att utföra utan en lokal Docker-daemon. Steg 1–2 (skapa cloud-projekt
`flowpay-prod` i region `eu-north-1`, spara nycklar i lösenordshanteraren)
är dessutom uttryckligen manuella enligt briefen.

Jag avstod medvetet från att scaffolda `packages/db/supabase/config.toml`
manuellt — den filen genereras av `supabase init` och version-låses till
den lokala CLI:n. Att förhandsskriva den skulle skapa friktion när du
kör `supabase init` lokalt.

## Exakt symptom
- Ingen `docker`-binär i PATH.
- Ingen `/var/run/docker.sock`.
- Ingen mekanism för Cowork-agenten att autentisera mot supabase.com och
  skapa ett projekt åt dig (skulle dessutom vara en write-action utanför
  briefens scope).

## Min bästa gissning om orsak
Supabase-setup är medvetet en lokal/manuell milstolpe (Anti-pattern i
briefen: "ALDRIG riktiga keys i repo"). Den schemalagda agenten har
varken Docker eller dina credentials, och bör inte ha det heller.

## Vad jag behöver från Zivar
Kör briefen lokalt på din Windows-maskin:

1. Skapa Supabase-projekt på supabase.com:
   - Namn: `flowpay-prod`
   - Region: `eu-north-1` (Stockholm)
   - Spara `Project URL`, `anon key`, `service_role key` i din lösenordshanterare.
2. På din maskin:
   ```bash
   cd payflow
   mkdir -p packages/db
   cd packages/db
   pnpm init
   pnpm add -D supabase
   npx supabase init
   npx supabase start          # kräver Docker Desktop
   ```
3. Verifiera att Studio öppnas på http://localhost:54323.
4. Skapa `apps/api/.env.example` med variablerna (utan värden) per Steg 8.
5. Skriv kort README i `packages/db` med `db:start` / `db:stop` / `db:reset`-skript.
6. Commit som `chore(db): supabase local dev setup` och push.
7. Flytta denna fil till `briefs/done/BRIEF-IN-002.done.md` (eller bara radera
   `.blocked.md`-filen) — så plockar nästa scheduled run upp DB-001 automatiskt.

Alternativt: om du vill att agenten ska scaffolda `apps/api/.env.example`
+ tom `packages/db/package.json` + README som förberedelse (utan att köra
`supabase start`), skapa `questions/BRIEF-IN-002.scaffold-only.question.md`
med "Ja, scaffolda strukturen, jag kör supabase init själv" så gör jag
det i nästa körning.

## Konsekvens för sprintplanen
- DB-001, SC-001, DB-002, DB-003 är beroende av IN-002 → också blockerade.
- UI-001 beror bara på IN-001 → eligible nu, blir nästa brief i nästa körning.
