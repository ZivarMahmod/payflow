# BRIEF-TA-002: Dashboard-vy
Thinking: 🟡 Think

## Mål
Dashboard med dagens stats: antal betalningar via FlowPay, total volym, snittrating, top reviews.

## Kontext
- Restaurangägaren öppnar 1-2 ggr/vecka. Måste ge "wow"-känsla även med lite data.
- Server Components för snabb initial load.

## Berörda filer
- `apps/admin/src/app/(dashboard)/page.tsx`
- `apps/admin/src/components/StatCard.tsx`
- `apps/admin/src/components/WeeklyChart.tsx`
- `apps/admin/src/components/TopReviewsList.tsx`
- `apps/admin/src/lib/queries/dashboard.ts`

## Steg
1. Skapa stat-aggregation-RPC i Supabase: get_dashboard_stats(restaurant_id) returnerar:
   - today_payment_count, today_total_amount, today_avg_rating
   - week_payment_count, week_total_amount, week_avg_rating
   - week_chart: [{ date, count, total }] för senaste 7 dagarna
2. lib/queries/dashboard.ts: server-side fetch via service_role.
3. page.tsx (Server Component):
   - 3 StatCards: Idag / Vecka / Snitt-rating
   - WeeklyChart (recharts) med betalningsvolym
   - TopReviewsList (5 senaste höga reviews)
4. StatCard: stor siffra, % förändring vs förra perioden, mini-trend-spark.
5. Auto-refresh var 60s.
6. Commit: `feat(admin): dashboard view`.

## Verifiering
- [ ] Stats visas korrekt med riktig data.
- [ ] Tom state hanteras snyggt (inga betalningar idag → "Här syns dagens betalningar").
- [ ] Chart renderar utan fel.
- [ ] Auto-refresh funkar utan UI-jank.

## Anti-patterns
- Hämta ALDRIG individuella records för aggregation — använd SQL-aggregat.
- Refresha ALDRIG snabbare än 60s — onödig load.

## Kopplingar
Beror på: TA-001, DB-002, DB-003.
