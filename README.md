# FlowPay

QR-baserad pay-at-table för restauranger i Sverige. Bygger ovanpå befintliga
POS-system (Onslip, Caspeco, ...) — vi byter aldrig kassasystem, vi lyssnar
via API, visar notan för gästen, tar betalt, säger till POS att det är klart.

## Repo-struktur

```
payflow/
├── COWORK-CHARTER.md       # principer + vad agenten INTE gör
├── AGENT-BOOTSTRAP.md      # operativ checklista per körning
├── docs/
│   ├── FlowPay-Master-v2.md    # arkitektur + patterns
│   ├── mock-strategy.md        # mock-first för externa
│   └── (referenspack)
├── briefs/
│   ├── README.md               # körordning + beroenden
│   ├── BRIEF-*.md              # 28 briefs
│   ├── done/                   # klara briefs (.done.md)
│   └── blocked/                # blockerade briefs (.blocked.md)
├── questions/                  # frågor från agent till Zivar
└── status/                     # körnings-rapporter (YYYY-MM-DD-HH.md)
```

## Sprint-status

Se senaste fil i `status/` för aktuell progress.
Se `briefs/done/` för klara briefs.
Se `briefs/blocked/` för aktiva block.

## Kör lokalt

Instruktioner läggs till av IN-001 (monorepo setup). Tills dess: tomt skal.
