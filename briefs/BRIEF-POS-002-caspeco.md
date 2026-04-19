# BRIEF-POS-002: Caspeco-adapter
Thinking: 🔴 Think hard

## Mål
Implementera Caspeco POS-adapter (största marknadsandel i Sverige).

## Kontext
- Caspeco-API: REST + OAuth2.
- Strukturen liknar Onslip men auth är OAuth2 (refresh tokens).
- Återanvänd POSProvider-interfacet — minimal core-impact.

## Berörda filer
- `packages/pos-adapters/src/caspeco/index.ts`
- `packages/pos-adapters/src/caspeco/client.ts`
- `packages/pos-adapters/src/caspeco/mapper.ts`
- `packages/pos-adapters/src/caspeco/oauth.ts`
- `apps/api/src/routes/integrations/caspeco-oauth.ts`

## Steg
1. Ansök om Caspeco partner-access (OAuth client_id + client_secret).
2. caspeco/oauth.ts: hantera authorization_code-flow, refresh tokens.
3. Lagra tokens krypterat i pos_integrations.credentials_encrypted (JSON: { access_token, refresh_token, expires_at }).
4. caspeco/client.ts: axios-instance med automatic token refresh på 401.
5. caspeco/mapper.ts: Caspeco order-format → POSOrder.
6. caspeco/index.ts: implementerar POSProvider.
7. routes/integrations/caspeco-oauth.ts:
   - GET /integrations/caspeco/auth → Caspeco authorize URL.
   - GET /integrations/caspeco/callback → exchange code för tokens, spara.
8. Update Settings/Integrations-sida (TA-004) med Caspeco-onboarding.
9. Commit: `feat(pos): caspeco adapter`.

## Verifiering
- [ ] OAuth-flow funkar end-to-end.
- [ ] Refresh tokens fungerar (testa expired access_token).
- [ ] Sync funkar via shared scheduler från POS-001.
- [ ] markOrderPaid via Caspeco-API funkar.
- [ ] Tokens lagras krypterat (ej läsbara utan Vault).

## Anti-patterns
- Hårdkoda ALDRIG Caspeco-logik utanför adaptern.
- Glöm INTE refresh_token-logik — access_tokens dör.

## Kopplingar
Beror på: POS-001 (samma scheduler, samma interface).
