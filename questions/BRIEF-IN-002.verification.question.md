# BRIEF-IN-002 — 2 verifs kvar att köra på din maskin

**Date:** 2026-04-20 (efter region-swap till flowpay-sweden)
**Projekt:** `flowpay-sweden`, project-ref `nhpmaxtdxkzbauqbkbdk`

**Context:** Sandboxen där jag kör har ingen egress till `*.supabase.co`
eller `release-assets.githubusercontent.com` (proxy 403). Pre-flight-gaten
i din answer-fil returnerade `HTTP=000`. All scaffolding är klar +
committad, men två checkbox-verifs i briefens `Verifiering`-sektion
kräver din maskin.

## Vad du behöver göra (5 min)

```bash
cd /path/to/payflow/packages/db

# 1. Re-installera så supabase-postinstall hämtar CLI-binären med full nätverksåtkomst
pnpm install

# 2. Login en gång per maskin (öppnar browser)
npx supabase login

# 3. Länka till nya cloud-projektet
npx supabase link --project-ref nhpmaxtdxkzbauqbkbdk

# 4. Verif 1: projects list ska lista flowpay-sweden
npx supabase projects list

# 5. Verif 2: REST-API svarar med JSON (pre-flight gate från answer-filen)
source ../../.agent/env.sh
curl -s -o /tmp/sb.json -w "%{http_code}\n" \
  "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY"
head -c 200 /tmp/sb.json
```

Förväntat:
- Steg 4: rad som innehåller `flowpay-sweden` + project-ref `nhpmaxtdxkzbauqbkbdk`.
- Steg 5: HTTP 200, body är Swagger/JSON med tom schema (OK — DB-001 lägger tabeller).

## Om något fungerar inte

- **`pnpm install` varnar om "Failed to create bin":** Windows-mount
  artefakt. Verifiera med `npx supabase --version` att binären finns.
- **`supabase link` säger "config.toml has different values":**
  kör `npx supabase init --force` först, sen `link`. Min handskrivna
  `config.toml` är minimal och skrivs över utan problem.
- **`curl` returnerar 401/403:** kontrollera `.agent/secrets.env`:
  `SUPABASE_ANON_KEY` ska vara `sb_publishable_...`, inte
  `sb_secret_...`. Om det är fel nyckel → Supabase dashboard →
  Settings → API → kopiera `anon public` igen.
- **`curl` returnerar 000/timeout:** projektet kanske pausas av Supabase
  (inactivity på free-tier, men du är Pro så det borde inte gälla).
  Kolla https://supabase.com/dashboard/project/nhpmaxtdxkzbauqbkbdk för
  status.

## När klart

- Ingen action behövs i filerna. Nästa schemalagda run plockar
  **BRIEF-DB-001** (tenants-schema) automatiskt.
- Om du vill markera verifs-svaret: flytta denna fil till
  `questions/done/BRIEF-IN-002.verification.answer.md` med en kort
  "PASS"-anteckning.

## Varför detta inte blockar DB-001

DB-001 behöver:
1. ✅ `packages/db/package.json` med db:push-script.
2. ✅ `packages/db/supabase/config.toml` med `project_id` satt.
3. ✅ `packages/db/supabase/migrations/`-katalog redo för SQL.
4. Cloud-projektet fungerar — antar vi fram till motsatsen bevisas. Om
   DB-001:s `pnpm db:push` fallerar, blockar jag den briefen på exakt
   det felmeddelandet.

Dessutom: du kommer ändå köra binär-install på din maskin, så
`supabase login`/`link` gör du naturligt när du vill köra migrations
själv.

## Anteckning om `SUPABASE_DB_PASSWORD`

Din answer noterar att DB_PASSWORD inte är satt i secrets.env än.
`supabase db push` använder det när det deployar migrations. DB-001
kan scaffolda migration-filer utan password, men påpekar det i sin
done-fil om push-steget behövs där. Om DB-001 vill verifiera push →
jag blockar med det konkret felet.
