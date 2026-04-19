# BRIEF-KI-002: Visa nota-skärm med riktig data
Thinking: 🟡 Think

## Mål
Koppla gäst-PWA till GET /orders/:token via TanStack Query. Ta bort dummy. Visa loading/error-states polished.

## Kontext
- Första riktiga klient-server-kopplingen.
- Stale-time 30s — notor kan ändras under sessionen (servitör lägger till drycker).
- Loading/error måste kännas premium — friktion här tappar gäst.

## Berörda filer
- `apps/guest/src/api/client.ts`
- `apps/guest/src/api/orders.ts`
- `apps/guest/src/routes/order.tsx`
- `apps/guest/src/components/OrderSkeleton.tsx`
- `apps/guest/src/components/OrderError.tsx`
- `apps/guest/src/main.tsx`

## Steg
1. Installera: @tanstack/react-query (om ej från KI-001).
2. api/client.ts: fetch-wrapper, läser VITE_API_URL från .env.
3. api/orders.ts: getOrder(token) — fetch + Zod-validera response (samma schema från packages/schemas).
4. main.tsx: QueryClientProvider med default staleTime 30_000.
5. routes/order.tsx:
   - useQuery(['order', token], () => getOrder(token))
   - Loading → OrderSkeleton (skimmer-animation, Framer Motion)
   - Error → OrderError med retry-knapp
   - Success → animerad render av items (staggered fade-in)
6. Totalsumma sticky bottom, stor typografi (32px+).
7. .env.example: VITE_API_URL.
8. Commit: `feat(guest): connect to orders API`.

## Verifiering
- [ ] Real order från dev-DB visas.
- [ ] Loading-state ser premium ut.
- [ ] Error + retry funkar (testa med API nere).
- [ ] Framer Motion-animering kör vid första render, ej vid cache-hit.
- [ ] Stabil prestanda på Chrome throttled 3G Fast.

## Anti-patterns
- ALDRIG manuell cache-invalidering — staleTime räcker.
- ALDRIG polling — cache + refetch on focus räcker.
- INTE spinner > 200ms — skeleton direkt.

## Kopplingar
Beror på: KI-001, API-002.
