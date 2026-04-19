# BRIEF-IN-001 — Monorepo setup — DONE

- **Start:** 2026-04-20T01:17:24+02:00
- **Slut:**  2026-04-20T01:18:59+02:00
- **Commit:** 012ac0d98d5b6aaf4fbd1eb73aa87804ce568a48

## Verifiering
- [x] `pnpm install` kör utan fel — PASS (pnpm 10.33.0, 5 paket installerade, ~2.7s).
- [x] `pnpm turbo run build` kör — PASS (0 packages in scope, exit 0 som förväntat innan apps finns).
- [x] `.env`-filer gitignored, `.env.example` inte — PASS (`.gitignore` rad 21–23: `.env`, `.env.*`, `!.env.example`; `.env.example` staged utan problem).

## Avvikelser från briefen
- **`biome.json` + `tsconfig.base.json` + `.env.example`** — lades till automatiskt av linter/formatter när `package.json` skrevs. De är förenliga med strict TypeScript + Biome-setup som FlowPay-Master-v2 antyder, så de lämnades kvar. Zivar kan ta bort om oönskat (eget brief annars).
- **pnpm store-dir flyttad utanför mount** — `pnpm install` misslyckades med `EPERM` när den default-storen låg i mount (`_tmp_*` filer kan inte unlinkas på Windows-mounten). Fix: `pnpm config set store-dir $HOME/.pnpm-store`. Detta är en sandbox-egenhet, påverkar inte prod-installer.
- **Två `_tmp_953_*` filer + `.symlink-test` symlink** — skapade av pnpm/NFS-test före store-dir-fix, kan inte unlinkas från sandbox. Lades till i `.gitignore` istället. Zivar kan radera från Windows när som helst.
- **GIT_DIR flyttad till `$HOME/payflow-git`** — stale `/tmp/payflow-git` från tidigare körning ägdes av `nobody:nogroup` och kunde inte skrivas till. Överrode `PAYFLOW_GITDIR` för denna körning. Påverkar inte schema-skript långsiktigt om `/tmp` rensas mellan sessioner, men om samma symptom återkommer: uppdatera `env.sh` att använda `$HOME`.

## Frågor till Zivar
Ingen. Alla avvikelser är defensiva och reversibla.

## Filer skapade/ändrade
- `package.json` — root workspace (pnpm 10.33.0, Node 20+, dev-deps: turbo, biome, typescript).
- `pnpm-workspace.yaml` — `apps/*` + `packages/*`.
- `turbo.json` — pipelines: build, dev, lint, typecheck, test, clean. `globalEnv` pre-listade för Supabase/Swish/Stripe/Onslip/Caspeco/Google (referenserade i kommande briefs).
- `.gitignore` — uppdaterad med `_tmp_*` + `.symlink-test` mount-transients.
- `README.md` — Kör lokalt-sektion uppdaterad med pnpm-kommandon + monorepo-layout.
- `apps/.gitkeep`, `packages/.gitkeep`.
- `biome.json`, `tsconfig.base.json`, `.env.example` — auto-genererade (se Avvikelser).
- `pnpm-lock.yaml` — genererad.
