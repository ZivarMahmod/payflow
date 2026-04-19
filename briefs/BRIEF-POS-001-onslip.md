# BRIEF-POS-001: Onslip-adapter + sync-jobb
Thinking: 🔴 Think hard

## Mål
Implementera första POS-adaptern (Onslip). Pollar öppna notor från Onslip, syncar till orders_cache, uppdaterar var 30:e sekund.

## Kontext
- Onslip först: API:t är välstrukturerat och de är pro-integrationer.
- Adapter-pattern: alla POS implementerar samma interface (POSProvider).
- Polling tills webhooks finns — Onslip stödjer webhooks senare.
- API-credentials krypteras i Supabase Vault.

## Berörda filer
- `packages/pos-adapters/package.json`
- `packages/pos-adapters/src/types.ts`
- `packages/pos-adapters/src/onslip/index.ts`
- `packages/pos-adapters/src/onslip/client.ts`
- `packages/pos-adapters/src/onslip/mapper.ts`
- `packages/db/supabase/migrations/004_pos_integrations.sql`
- `apps/api/src/services/pos-sync.ts`
- `apps/api/src/services/sync-scheduler.ts`

## Steg
1. Migration 004 — `pos_integrations`-tabellen:
   - id, restaurant_id, location_id (fk)
   - type (text check in ('onslip','caspeco','lightspeed'))
   - credentials_encrypted (text) — krypterad via Vault
   - external_location_id (text) — id i POS:ens system
   - status (text check in ('active','paused','error'))
   - last_synced_at, last_error, created_at, updated_at
2. Skapa packages/pos-adapters med pnpm init.
3. types.ts — interface POSProvider:
   ```ts
   export interface POSOrder {
     externalId: string;
     tableNumber: string | null;
     total: number;
     items: Array<{ name: string; qty: number; unitPrice: number }>;
     openedAt: Date;
   }
   export interface POSProvider {
     authenticate(creds: any): Promise<void>;
     fetchOpenOrders(externalLocationId: string): Promise<POSOrder[]>;
     fetchOrder(externalLocationId: string, externalOrderId: string): Promise<POSOrder>;
     markOrderPaid(externalLocationId: string, externalOrderId: string, payment: { method: string; amount: number; reference: string }): Promise<void>;
     fetchTables?(externalLocationId: string): Promise<Array<{ number: string }>>;
   }
   ```
4. onslip/client.ts — axios-wrapper med API-key auth.
5. onslip/mapper.ts — Onslip-format → POSOrder.
6. onslip/index.ts — implementerar POSProvider.
7. apps/api/src/services/pos-sync.ts:
   - syncRestaurant(restaurant_id) → hämta integration → adapter.fetchOpenOrders → upsert i orders_cache (UNIQUE constraint på (restaurant_id, pos_order_id, pos_type))
   - Rader som inte längre finns i POS markeras status='closed'
8. apps/api/src/services/sync-scheduler.ts — setInterval var 30s, loopa aktiva integrations, syncRestaurant per st.
9. Felhantering: try/catch per restaurant, exponential backoff, sätt status='error' + last_error vid persistent fel.
10. Vault setup för credentials — använd Supabase Vault eller pgsodium.
11. Commit: `feat(pos): onslip adapter + sync`.

## Verifiering
- [ ] Onslip sandbox-test: skapa nota → inom 30s finns i orders_cache.
- [ ] Item som läggs till på noten i POS → reflekteras i cache vid nästa sync.
- [ ] Stängd nota i POS → cache.status = 'closed'.
- [ ] Credentials kan inte läsas från DB utan Vault-access.
- [ ] Sync stoppar för integration med status='paused'.

## Anti-patterns
- ALDRIG Onslip-specifik logik utanför adaptern.
- ALDRIG API-keys i klartext.
- Låt INTE en kund med problem stoppa hela schedulern — circuit breaker per restaurant.
- Skriv ALDRIG till POS:en utöver markOrderPaid.

## Kopplingar
Beror på: API-001, DB-002.

## Rollback
Stoppa scheduler, ta bort packages/pos-adapters + migration 004.
