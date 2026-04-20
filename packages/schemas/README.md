# @flowpay/schemas

Shared Zod schemas used across guest PWA, admin, and API.

## Why

All boundaries (HTTP request/response, POS-adapter → API, localStorage) must
validate data the same way. One source of truth avoids drift between the
Fastify handlers and the React apps.

## Rules

- **Amounts are in öre** — integer, SEK × 100. Never floats. `125,00 kr` → `12500`.
- **Dates are ISO 8601 strings** — parsed once at the edge if a `Date` is needed.
- **Every schema exports its inferred TS type** — use `Order` and `OrderItem` directly.

## Current schemas

| Symbol            | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `orderSchema`     | A restaurant bill view (guest reads this)            |
| `orderItemSchema` | A single line on the bill                            |
| `orderTokenSchema`| Opaque POS-order token from the QR (`?order=<token>`)|
| `orderStatusSchema`| `open` / `paid` / `closed` / `cancelled`           |
| `amountOre`       | Primitive validator for öre amounts                  |

## Add a schema

1. Define it in `src/index.ts` (or a sibling file and re-export).
2. Export both the schema and the inferred type.
3. Keep the schema close to the boundary that consumes it — avoid speculative types.
4. Run `pnpm --filter @flowpay/schemas typecheck`.

## Consumed by

- `apps/guest` — renders the bill view (KI-001 onwards).
- `apps/admin` — feedback inbox, dashboards (TA-*).
- `apps/api` — `/orders/:token` response (API-002).
