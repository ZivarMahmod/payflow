# BRIEF-API-002: GET /orders/:token endpoint
Thinking: 🟡 Think

## Mål
Publik (anon) endpoint som gäst-PWA anropar för att hämta nota via order_token.

## Kontext
- Gästens URL: `flowpay.se/t/{slug}/{table-id}?order={order_token}`
- App anropar GET `/api/orders/{order_token}`.
- Vi returnerar order + items + restaurant-publika fält. INGA känsliga fält.
- Ingen auth — token är access control.

## Berörda filer
- `apps/api/src/routes/orders.ts`
- `packages/schemas/src/order.ts` (delade Zod-scheman)

## Steg
1. Skapa `packages/schemas` om inte redan finns.
2. Definiera Zod-schema för OrderResponse:
   ```ts
   export const OrderResponseSchema = z.object({
     id: z.string(),
     total: z.number(),
     currency: z.string(),
     status: z.enum(['open', 'paying', 'paid', 'closed']),
     items: z.array(z.object({ name: z.string(), qty: z.number(), unitPrice: z.number(), lineTotal: z.number() })),
     restaurant: z.object({ name: z.string(), logoUrl: z.string().nullable(), swishNumber: z.string().nullable() }),
     table: z.object({ number: z.string().nullable() }),
   });
   ```
3. routes/orders.ts: GET /orders/:token
   - Validera token (Zod min/max length).
   - Anropa RPC get_order_by_token(token) via service-role-client.
   - 404 om null. 410 om status='closed' eller 'paid'.
   - Response enligt schema.
4. Lägg till @fastify/rate-limit på endpointen (10 req/min per IP).
5. Skriv vitest-test med mock supabase.
6. Commit: `feat(api): GET /orders/:token`.

## Verifiering
- [ ] GET med giltig token returnerar korrekt struktur.
- [ ] GET med ogiltig token → 404.
- [ ] Rate-limit triggar efter 10 req/min.
- [ ] Inga interna id:n exponeras (cost_price, internal pos_order_id, credentials).
- [ ] Tester gröna.

## Anti-patterns
- ALDRIG returnera internal `pos_order_id` i response.
- Cacha ALDRIG response.
- Returnera ALDRIG hela restaurant-objektet — bara filtrerade fält.

## Kopplingar
Beror på: API-001, DB-002.
