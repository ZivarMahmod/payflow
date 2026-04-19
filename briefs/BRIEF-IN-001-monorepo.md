# BRIEF-IN-001: Monorepo setup
Thinking: 🟢 Normal

## Mål
Skapa monorepo med Turborepo + pnpm workspaces. Tre apps senare: guest, admin, api. Inga apps ännu — bara scaffolding.

## Berörda filer
- `package.json` — workspace root
- `pnpm-workspace.yaml`
- `turbo.json`
- `.gitignore`
- `README.md`

## Steg
1. `pnpm init` i projektroten.
2. Skapa `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - 'apps/*'
     - 'packages/*'
   ```
3. Installera Turborepo: `pnpm add -D turbo -w`.
4. Skapa `turbo.json` med pipelines för: build, dev, lint, typecheck, test.
5. Lägg till root scripts: `dev`, `build`, `lint`, `typecheck`, `test`.
6. Skapa tomma `apps/` och `packages/` med `.gitkeep`.
7. `.gitignore`: node_modules, .env, .env.*, !.env.example, .turbo, dist, .next, .DS_Store.
8. Kort README som beskriver strukturen.
9. Commit: `chore: monorepo scaffold`.

## Verifiering
- [ ] `pnpm install` körs utan fel.
- [ ] `pnpm turbo run build` kör (även om inget bygger ännu).
- [ ] `.env`-filer är gitignored, `.env.example` är inte.

## Anti-patterns
- Använd INTE npm/yarn — endast pnpm.
- Lägg INTE till apps i denna brief — separata briefs.

## Kopplingar
Första briefen — allt bygger på denna.
