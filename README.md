# FlowPay

QR-baserad pay-at-table för restauranger i Sverige. Bygger ovanpå befintliga
POS-system (Onslip, Caspeco, ...) — vi byter aldrig kassasystem, vi lyssnar
via API, visar notan för gästen, tar betalt, säger till POS att det är klart.

## Repo-struktur

```
payflow/
├── apps/
│   ├── api/                  # Fastify backend (port 3001)
│   └── guest/                # gäst-PWA (port 5173)
├── packages/
│   ├── db/                   # Supabase migrations + generated types
│   ├── pos-adapters/         # Onslip + Caspeco POS-integrationer
│   ├── qr-pdf/               # QR-PDF-generering (för admin)
│   ├── schemas/              # Delade Zod-scheman (wire shapes)
│   └── ui/                   # Design system: tokens, Button, Card, Stack
├── briefs/                   # Sprint-specifikationer (28 briefs)
│   ├── BRIEF-*.md            # öppna briefs
│   ├── done/                 # klara briefs (.done.md / .prepared.md)
│   └── blocked/              # blockerade briefs
├── docs/                     # All projektdokumentation
│   ├── COWORK-CHARTER.md     # principer för agenten
│   ├── CONTEXT-DISCIPLINE.md # context-disciplin
│   ├── SKIP-CONDITIONS.md    # skip/prepared-policy
│   ├── FlowPay-Master-v2.md  # arkitektur + patterns
│   ├── EMAIL-TEMPLATES.md    # mailtexter
│   ├── SCHEDULE-reference.md # schemalägg-referens
│   └── mock-strategy.md      # mock-first för externa
├── old/                      # icke-aktuellt, för granskning
│   ├── night-run-2026-04-23/ # arkiverade sprint-loggar
│   ├── questions/            # gamla agent-Q&A
│   ├── PaymentMethodSelector.tsx
│   └── COWORK-INSTRUCTIONS-v1.md
├── README.md                 # denna fil
├── STATUS-ZIVAR-EFTER-KONTROLL.md  # din kvarvarande TODO efter natten
└── (configs: biome, package, pnpm-lock, pnpm-workspace, tsconfig, turbo)
```

## Status

- **Natten 2026-04-23:** 28/28 briefs processade. 4 done autonomt, 17 prepared
  (verifierade lokalt 2026-04-23/24), 7 skipped (väntar på beslut/secrets).
- **2026-04-24:** Guest-PWA re-skinad till editorial design (9 skärmar).

Se `docs/SKIP-CONDITIONS.md` för vilka 7 briefs som väntar på dig
(Stripe, auth-provider, säkerhetsreview).

## Kör lokalt

### Förutsättningar
- Node.js 20+
- pnpm 10+ (`npm install -g pnpm`)
- Supabase-projekt + `apps/api/.env` + `apps/guest/.env` (se `.env.example`)

### Setup
```bash
pnpm install
```

### Vanliga kommandon
```bash
pnpm dev        # Starta alla apps i dev-läge (turbo)
pnpm build      # Bygg alla paket
pnpm lint       # Linta alla paket
pnpm typecheck  # TypeScript-check
pnpm test       # Kör tester
pnpm clean      # Rensa build-artefakter + node_modules
```

Eller kör en app i taget:
```bash
pnpm --filter @flowpay/api dev      # backend, http://localhost:3001
pnpm --filter @flowpay/guest dev    # frontend, http://localhost:5173
```

### Test-URL
Med seedad data:
```
http://localhost:5173/t/test-bistro/Bord1?order=bord-1-dev
```

## Arkitektur i en mening

POS äger orderdata + kvitto. **Vi cache:ar bills i `orders_cache`**, brokerar
betalningar via Swish/Stripe, för egen ledger i `payments`, märker tillbaka i
POS när det är klart. Gästen scannar QR → ser nota → betalar → får kvitto.

Mer detaljer i [docs/FlowPay-Master-v2.md](docs/FlowPay-Master-v2.md).
