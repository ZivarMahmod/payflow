# @flowpay/db

Supabase Cloud-first dev setup for FlowPay. **No local Docker.**

Projekt: `flowpay-sweden` (Sweden-region, project-ref `nhpmaxtdxkzbauqbkbdk`).
Pro-plan. Vi kör mot molnet som dev-miljö — prod/dev är samma instans tills
vi har tillräckligt med trafik för att motivera split.

## Första gången på en ny maskin

```bash
cd packages/db
pnpm install                                   # installerar supabase CLI
npx supabase login                             # en gång per maskin, öppnar browser
npx supabase link --project-ref nhpmaxtdxkzbauqbkbdk
```

Credentials för applikationen (SUPABASE_URL, keys, DB-lösen) ligger i
`.agent/secrets.env` på developer-maskinen. Gitignored. Ladda via
`source .agent/env.sh` innan du kör scripts.

## Daglig workflow

```bash
pnpm db:diff    # diff lokalt migrations-state vs cloud
pnpm db:push    # deploya nya migrations till cloud
pnpm db:pull    # hämta cloud-schema till migrations/ (om någon ändrat via Studio)
pnpm db:status  # listar dina Supabase-projekt (sanity check)
```

**Ingen** `db:start` / `db:stop` / `db:reset` — vi kör inte lokal Supabase.
Om du behöver isolerad testdata, använd en branch i Supabase (Pro-feature).

## Att lägga till en migration (från och med DB-001)

```bash
npx supabase migration new <namn>
# redigera packages/db/supabase/migrations/<timestamp>_<namn>.sql
pnpm db:diff        # sanity check — vad skulle ändras i cloud
pnpm db:push        # applicera
```

## Varför inte Docker lokalt?

- Pro-plan finns redan — en miljö mindre att synka.
- Den schemalagda agenten har ingen Docker i sandboxen.
- Migrations kan testas mot branch utan lokal stack.

Om vi senare behöver isolera dev från prod (när vi har trafik), är
`supabase start` + `supabase db reset` fortfarande en option — vi kör
ingenting som stänger den dörren.

## Säkerhet

- `SUPABASE_SERVICE_KEY` är en fullständig service-role — sätts aldrig i
  client-bundlad kod, bara server-side (Fastify, scheduled jobs).
- `SUPABASE_ANON_KEY` (publishable, `sb_publishable_...`) är OK att skicka
  till browsern — RLS ska skydda allt (kommer i SC-001).
- Kör **ALDRIG** `supabase db reset` mot cloud — det droppar allt schema.

## Filer i denna katalog

- `package.json` — CLI som devDep, db-scripts.
- `supabase/config.toml` — project_id pinnat till `nhpmaxtdxkzbauqbkbdk`.
  Regenerera med `npx supabase init --force` om du vill ha full default-mall.
- `supabase/migrations/` — SQL-migrations (fylls i DB-001).

## Relaterade briefs

- **IN-002** (denna): cloud-first setup.
- **DB-001** (nästa): tenants-schema.
- **SC-001**: Row-Level Security policies.
- **DB-002**: orders_cache + payments.
