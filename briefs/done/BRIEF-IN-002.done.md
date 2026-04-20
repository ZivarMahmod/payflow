# BRIEF-IN-002 — Supabase + dev-miljö (cloud-first) — DONE (partial, retry)

- **Start:** 2026-04-20T05:07:00+02:00
- **Slut:**  2026-04-20T05:52:00+02:00
- **Commit:** pending (denna körnings slutcommit)
- **Cloud-projekt:** `flowpay-sweden` (project-ref `nhpmaxtdxkzbauqbkbdk`, Sweden-region)

## Verifiering

- [x] `packages/db/supabase/config.toml` existerar, `project_id = "nhpmaxtdxkzbauqbkbdk"`.
- [ ] `npx supabase projects list` visar `flowpay-sweden` — **pending Zivar**
      (sandboxen kunde inte ladda ner supabase-CLI-binären — proxy 403).
- [ ] Cloud-projektet nåbart via curl smoke test — **pending Zivar**
      (sandbox-proxy blockar `*.supabase.co` med 403 efter CONNECT;
      pre-flight-gaten i Zivars answer-fil returnerade HTTP=000).
      Se `questions/BRIEF-IN-002.verification.question.md`.
- [x] `.env.example` committad; `.env` + `.agent/secrets.env` gitignored.
- [x] Root `.env.example` har SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY.

## Avvikelser från briefen

### 1. Denna körning fick göra om mycket

Körningens första halva (05:07-05:38) innehöll två fel:

**Fel 1:** Vid run-start hade Zivar redan pushat `97d49be` (Unblock IN-002)
men fresh GIT_DIR gör `git reset --soft origin/main` utan att röra
worktree. Mount-filerna var stale → `git add -A` → commit `35419f2`
revert:ade oavsiktligt Zivars unblock (återskapade blocked.md,
raderade answer.md, rollade tillbaka brief-innehåll till pre-cloud).

**Fel 2:** Såg inte Zivars `049ca8a` (PAUSE) + `143557f` (Resume) förrän
jag försökte pusha min första fix-commit (`ac5cb5b`) som konfliktade.
Zivar hade under tiden raderat det gamla Supabase-projektet
(`flowpay-prod` / `xpzxqhefxczcrvkqltdp`) pga region-problem och skapat
nytt (`flowpay-sweden` / `nhpmaxtdxkzbauqbkbdk`).

**Åtgärd:** `git reset --mixed origin/main`, uppdaterade alla referenser
till nya project-ref:et, behöll scaffolding-arbetet. Ingen commit av
`ac5cb5b` — den pushades aldrig till origin.

### 2. `supabase init` ersattes av handskriven `config.toml`

**Varför:** Sandboxen har ingen egress till `release-assets.githubusercontent.com`
eller `*.supabase.co`. `supabase`-npm-paketet installerades via pnpm, men
postinstall-scriptet som hämtar Go-binären fick `EAI_AGAIN` och 403 från
proxy.

**Motivering:** `config.toml` är textfil. Skrev minimal cloud-kompatibel
variant med `project_id = "nhpmaxtdxkzbauqbkbdk"`. När Zivar kör
`npx supabase link` på sin maskin uppdateras filen om nödvändigt.
Alternativt: `npx supabase init --force` → full default-mall, sedan
patcha project_id.

### 3. Pre-flight verification gate fallerade (ej blocker)

Zivars fresh-answer inkluderade en pre-flight-gate:
```bash
curl -s -o /tmp/sb.json -w "%{http_code}" \
  "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY"
```

Output: `HTTP=000` → proxy 403. Samma begränsning som tidigare — kan
inte hoppas över från agent-sandboxen. Denna gate måste köras från
Zivars maskin; scaffolding fortsatte ändå eftersom:
- Alla env-variabler är satta (`[ -z "$SUPABASE_URL" ]`-checken passade).
- Fortsatt arbete skadar inte Zivars instans — vi skriver bara lokala filer.
- DB-001-körningen kan själv detektera broken credentials via sin
  `pnpm db:push` som antingen går eller blockerar på ett tydligare
  felmeddelande.

### 4. `SUPABASE_SERVICE_KEY` = `SUPABASE_SECRET_KEY` (alias)

Zivars nya secrets.env har `SUPABASE_SECRET_KEY` som primärt namn +
`SUPABASE_SERVICE_KEY` som alias för bakåtkompat. Min
`apps/api/.env.example` och root `.env.example` använder
`SUPABASE_SERVICE_KEY` (samma namn som brief-answerfilen 1st version
specificerade). Både namn pekar på samma sekret så applikationskod
senare kan använda antingen.

### 5. `SUPABASE_DB_PASSWORD` saknas i secrets.env

Noterat av Zivar: `db:push` kommer behöva det. Inte behövt för IN-002
självt (bara scaffolding + config). Om DB-001 eller senare brief
blockerar på saknade password → då skapar jag blocked-fil med tydligt
felmeddelande, inte nu i förväg.

## Kodgranskning

🟢 Normal tier — ingen engineering:code-review skill invokerad per protokoll.

## Frågor till Zivar

Se `questions/BRIEF-IN-002.verification.question.md` för de 2 manual-verifs
som behöver köras på hennes maskin (5 min arbete). Blockar inte DB-001.

## Filer skapade/ändrade i denna brief

- `packages/db/package.json` (ny) — @flowpay/db, supabase@2.92.1 devDep
- `packages/db/README.md` (ny) — cloud-only workflow, flowpay-sweden
- `packages/db/supabase/config.toml` (ny) — minimal, project_id pinnad
- `packages/db/supabase/migrations/.gitkeep` (ny, tom)
- `apps/api/.env.example` (ny) — Supabase + mocks + PORT
- `.env.example` (uppdaterad) — cloud-first, SERVICE_ROLE_KEY → SERVICE_KEY
- `pnpm-lock.yaml` (uppdaterad) — supabase@2.92.1
- `questions/BRIEF-IN-002.answer.md` (flyttad till `questions/done/`)
- `questions/BRIEF-IN-002.verification.question.md` (ny) — pending verifs

## Meta: recommended housekeeping (inte del av IN-002)

- **`.agent/setup-git.sh`** fresh-init bör göra `git reset --hard
  origin/main` (inte `--soft`). Det här är en design-quirk där "worktree
  authoritative" antagandet inte håller när Zivar commitar från
  Windows-maskinen mellan agent-körningar.
- **Commit-push.sh** bör kolla `git fetch && git status -uno` innan
  `git add -A` för att upptäcka om origin har nya commits (förekomma
  framtida revert-incidenter).
