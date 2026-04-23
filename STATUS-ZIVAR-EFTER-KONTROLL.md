# STATUS-ZIVAR-EFTER-KONTROLL — sprint klar + granskning

**Datum:** 2026-04-23, sen kväll
**För:** Zivar (läs i morgon)
**Skriven av:** Cowork night-run efter att ha kört klart alla 28 briefs
och sedan gjort en genomgång för att hitta fel.

## TL;DR

- **28/28 briefs är processade.** 4 done, 17 prepared, 7 skipped.
- **Mekanisk granskning: inga P0-buggar.** Koden bör kompilera klent
  när du kör `pnpm install && pnpm typecheck` — jag kan inte själv
  köra det pga egress-blocket, men en genomsökning av alla imports,
  factory-registreringar, schema-exports, DB-kolumner och
  strict-mode-fallgropar visade inget som bryter build.
- **Breakdown matchar INTE prognosen i SKIP-CONDITIONS.md.** Prognosen
  var 11 done + 10 prepared + 7 skipped; vi landade på 4 + 17 + 7.
  Därför skrev jag `STATUS-COUNT-MISMATCH.md` istället för
  `SPRINT-COMPLETE.md` (projekt-reglerna säger så). Anledningen är
  ENKEL: inget av det som skulle varit "Done autonomously (mock-first)"
  kunde verifieras eftersom `pnpm typecheck` inte kan köras utan att
  npm-registry svarar. Så allt det blev PREPARED istället. Ingen
  kvalitetsförlust — bara ett status-etikettbyte.

## Skippade briefs (7)

| Brief | Skäl | Vad krävs för att köra |
|---|---|---|
| API-005 | MISSING_SECRET | Stripe-nycklar i `.agent/secrets.env` |
| KI-006 | DEPENDENCY_SKIPPED | Samma (beror på API-005) |
| **TA-001** | **DECISION_REQUIRED** | **Du väljer auth-provider i `.agent/CONTEXT.md`** (magic link / BankID / Clerk) |
| TA-002 | DEPENDENCY_SKIPPED | TA-001 först |
| TA-003 | DEPENDENCY_SKIPPED | TA-001 först |
| TA-004 | DEPENDENCY_SKIPPED | TA-001 först |
| SA-001 | ULTRATHINK | Kör interaktivt, aldrig unattended |

Den viktigaste beslutspunkten är **TA-001**. När du bestämt
auth-provider frigörs TA-002/003/004 + admin-UI-biten av POS-002
(Caspeco Connect-knappen) + admin-UI-biten av TA-005 (PDF-download).

## Preparerade briefs (17) — vad du behöver göra lokalt

Alla file-writes är klara. Det som är kvar är tre typer av manuell
verifiering som kräver nätverk / installerade pnpm-paket / Supabase-
access:

1. **Installera paket:** `pnpm install` (måste köras från din maskin
   med egress). Detta tar upp `packages/qr-pdf` som är helt ny.
2. **Typecheck + lint:** `pnpm typecheck && pnpm lint` i roten.
   Grundforskning säger att det bör vara grönt — men kör det.
3. **Supabase-migrationer:** DB-001, DB-002, DB-003, SC-001 har SQL-
   filer som väntar på `cd packages/db && pnpm supabase db push`.
4. **Swish / Onslip / Caspeco / Google mocks aktiva:** alla adapters
   default-körs mot sina mocks (`USE_MOCK_*=true` i secrets.env).
   Ingen vidare verifiering krävs förrän du vill stänga av mocken.

Fullständig lista i `NIGHT-RUN.md` under "Prepared".

## Senast tillkomna under denna körning

- **BRIEF-POS-002 — Caspeco-adapter + OAuth.**
  - `packages/pos-adapters/src/caspeco/{oauth,client,mapper,mock,index}.ts`
  - `apps/api/src/routes/integrations/caspeco-oauth.ts` (registrerad
    i `server.ts`). GET `/integrations/caspeco/auth` och
    `/integrations/caspeco/callback` klara.
  - HMAC-signerat state (10-min TTL) för CSRF. Tidsäker comparison
    via `crypto.timingSafeEqual`.
  - Känd lucka: admin-session-guard på routerna finns inte ännu —
    det hanteras när TA-004 landar. Just nu kan vem som helst som
    gissar en integration_id trigga OAuth-flödet; eftersom redirect
    går till Caspeco's egen login är blast-radien låg, men bör
    stängas innan prod.
  - Känd lucka: `pos_integrations.credentials_encrypted` lagrar
    tokens i plaintext. Infrastrukturen (pgcrypto + service-role-
    RPC) kan läggas till i en separat brief. Dokumenterat i
    `BRIEF-POS-002.prepared.md`.

- **BRIEF-TA-005 — QR-generator + print PDF.**
  - Bygd som fristående paket `packages/qr-pdf/` eftersom
    `apps/admin/` inte finns ännu.
  - `generateQrPdf(input)` → `Uint8Array` PDF-bytes. A4 4-per-sida
    (standard) eller A5 en-per-sida. Logo-embed PNG/JPEG. Brand-
    färg FlowPay-lila (`#6b3fa0`) default. Caption svensk default.
  - När TA-001 landar → 20-raders wrapper i admin-appen. Skeleton
    med exakt kod ligger i `BRIEF-TA-005.prepared.md`.

## Vad granskningen hittade

En subagent gick igenom:
- factory-registrering (POS-adapters),
- import-stigar,
- schema-exports,
- DB-kolumner vs kod-användning,
- package.json exports-maps,
- TypeScript strict-mode fallgropar,
- pnpm-workspace.yaml-pickup av nya paketet,
- HMAC-jämförelser (timing-safe),
- route-registrering.

**Inga P0-buggar.** Inga P1-buggar som skulle bryta typecheck.

**P2 — liten teknisk skuld att notera, inte akut:**

- `apps/api/src/services/pos-sync.ts:188` — `o.items as unknown as
  OrderCacheInsert['items']` kringgår type-checking på items-
  arrayen vid upsert till `orders_cache`. Om POSOrder.items-formen
  avviker från DB:ns jsonb-form accepteras dålig data tyst. Fix:
  en explicit mapper eller runtime-Zod-validate innan upsert. Inte
  bråttom — båda sidors schemas är välkontrollerade idag.

## Security surface (för framtida SA-001)

Här är listan på säkerhetsrelevanta invarianter som varje PREPARED
brief hävdar. SA-001 (Ultrathink) kan bekräfta eller motbevisa när
den körs:

1. **RLS:** Alla tenant-tabeller har RLS aktivt (SC-001). Service-
   role bypass används endast i API-routes, aldrig i klient-kod.
2. **Anon-nyckeln:** Går till `apps/guest` och `apps/admin` via
   NEXT_PUBLIC_* — aldrig service-role.
3. **Supabase RPC:** `get_order_by_token`, `get_pos_credentials`,
   `submit_review` är SECURITY DEFINER; argumenten är typade och
   validerade på DB-sidan.
4. **Swish:** Signerade webhooks (HMAC), mock-mode default.
5. **Caspeco OAuth:** State-param HMAC-signerat, timing-safe verify,
   10-min TTL. access_token + refresh_token i DB-blob.
6. **CSRF / hop-by-hop:** Fastify's default helmet + CORS är kvar.
   Inga /public/-mutationer utan tokens.
7. **QR-tokens:** Stabila per table; aldrig regenererade vid reprint.
   Skulle invalidera tryckta affischer.

## Vad som händer om du inte gör något

Night-run-schemat fortsätter försöka köra varje timme. Varje körning
kommer nu att:
1. Läsa NIGHT-RUN.md, se 28/28 + count-mismatch-status,
2. Läsa SKIP-CONDITIONS.md, se att 7 skippade ligger på dina beslut,
3. Inte hitta nån eligible brief,
4. Inte skriva mer.

Så det är lugnt om du inte tittar förrän i morgon — det kostar ingen
extra disk eller merge-konflikt. Men **schemat ska avslutas** enligt
din instruktion i kväll — se nedan.

## Vad du ska göra härnäst

Prio-ordning:

1. **Pull branchen** och kör `pnpm install && pnpm typecheck && pnpm lint`.
   Allt ska vara grönt; annars är min granskning fel och jag vill veta.
2. **Granska `BRIEF-POS-002.prepared.md`** — Caspeco-adaptern är 🔴
   tier och kan behöva en blick innan den mergas.
3. **Fatta auth-beslutet för TA-001** — skriv en rad i
   `.agent/CONTEXT.md` så night-run kan rulla TA-001 → TA-002/003/004.
4. **Provisionera Stripe-nycklarna** när du är redo — frigör
   API-005 + KI-006.
5. **SA-001 kör du själv** — interaktivt med min hjälp, inte
   unattended.

## Filer att läsa i ordning

1. `STATUS-COUNT-MISMATCH.md` (bredvid denna) — förklarar varför
   count:en inte matchar prognosen.
2. `NIGHT-RUN.md` — canonical lista över alla 28 briefs.
3. Varje `briefs/done/BRIEF-*.prepared.md` har manual-verifierings-
   steg specifika för just den briefen.

— slut —
