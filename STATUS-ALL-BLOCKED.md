# STATUS — Hela sprinten blockerad på BRIEF-IN-002

- **Tid:** 2026-04-20T05:07:00+02:00
- **Kvarvarande körningar sedan blockering:** 4 (02, 03, 04, 05)
- **Progress:** 3/28 briefs klara (IN-001, UI-001, KI-001). 1 blocked (IN-002). 0 eligible.

## Varför allt är blockerat

BRIEF-IN-002 (Supabase + lokal dev-miljö) är på kritisk väg. Alla 25
kvarvarande briefs beror på IN-002 direkt eller transitivt:

| Brief | Beror på | Status |
|---|---|---|
| **IN-002** | IN-001 ✓ | **BLOCKED** (Docker + Zivars Supabase-cloud-konto) |
| DB-001 | IN-002 | trans-blocked |
| SC-001 🔴 | DB-001 | trans-blocked |
| DB-002 | SC-001 | trans-blocked |
| DB-003 | DB-002 | trans-blocked |
| API-001 | IN-002 | trans-blocked |
| API-002..006 | API-001 / DB-* | trans-blocked |
| KI-002..007 | API-002 / DB-003 | trans-blocked |
| POS-001 🔴 | API-001, DB-002 | trans-blocked |
| POS-002 🔴 | POS-001 | trans-blocked |
| TA-001..005 | SC-001 / TA-001 | trans-blocked |
| SA-001 ⚫ | TA-001, SC-001 | trans-blocked |

Det finns ingen annan brief som kan köras förbi IN-002. Inga ytterligare
housekeeping-items är kända (git-setup fixad i run 04, commit `91501bb`).

## Vad jag behöver från dig, Zivar

Kör BRIEF-IN-002 lokalt på din Windows-maskin. Full anvisning i
`briefs/blocked/BRIEF-IN-002.blocked.md`. Kort version:

1. **Supabase-cloud-projekt** på supabase.com
   - Namn: `flowpay-prod`, region: `eu-north-1` (Stockholm)
   - Spara `Project URL`, `anon key`, `service_role key` i din lösenordshanterare.
2. **Lokalt** (kräver Docker Desktop):
   ```bash
   cd payflow
   mkdir -p packages/db && cd packages/db
   pnpm init && pnpm add -D supabase
   npx supabase init
   npx supabase start
   ```
3. Verifiera Studio på http://localhost:54323.
4. Skapa `apps/api/.env.example` (variabler utan värden) per Steg 8 i briefen.
5. Kort README i `packages/db` med `db:start` / `db:stop` / `db:reset`.
6. `git commit -m "chore(db): supabase local dev setup"` + push.
7. Flytta `briefs/blocked/BRIEF-IN-002.blocked.md` → `briefs/done/BRIEF-IN-002.done.md`.

Uppskattad tid på din sida: **15–30 min** (mest väntetid på Docker-bilden).

## Alternativ om du inte hinner köra hela IN-002 nu

Om du vill att agenten förbereder strukturen (utan Docker-steg), skapa
`questions/BRIEF-IN-002.scaffold-only.question.md` med innehållet:

> Ja, scaffolda `apps/api/.env.example` + tom `packages/db/package.json` +
> README. Jag kör `supabase init` och `supabase start` själv sen.

Då tar nästa körning det som en partial-eligible arbetsmängd.

## Vad agenten gör fram tills IN-002 släpper

**Inget produktivt.** Varje timme kommer bli en kort status-fil som
upprepar denna blockering. Om du vill spara körningar tills du har tid
att köra IN-002, skapa `PAUSE.md` i workspace-roten — det stoppar agenten
helt tills du tar bort filen.

## När IN-002 är klar

Nästa agent-körning plockar **BRIEF-DB-001** automatiskt (första
icke-beroende brief när IN-002 är `.done.md`). Rekommenderad ordning
för att stänga Gate G0:

1. DB-001 — Initial schema (~1 körning, 🟢)
2. SC-001 🔴 — Row-Level Security (~1–2 körningar, Think hard)
3. DB-002 — orders_cache + payments (~1 körning, 🟡)

Efter G0 öppnas API-001, KI-002 etc och Fas 1 (MVP-riset) kan börja.

## Referenser

- Blocked-detalj: `briefs/blocked/BRIEF-IN-002.blocked.md`
- Körordning: `briefs/README.md`
- Tidigare status: `status/2026-04-20-02.md` … `status/2026-04-20-04.md`
- Agent-protokoll: `AGENT-BOOTSTRAP.md`
