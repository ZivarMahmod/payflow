# Sprint paused

**Date:** 2026-04-20
**Reason:** Zivar is recreating the Supabase project (region swap to Sweden).
**Status:** Schemat ska inte köra IN-002 förrän nya credentials är på plats
i `.agent/secrets.env`.

## Unpause
1. Zivar skapar nytt Supabase-projekt i Sverige-regionen.
2. Zivar skickar URL + anon/publishable key + secret key + DB-password i Cowork-chatten.
3. Claude i chatten uppdaterar `.agent/secrets.env` och raderar denna fil.
4. Schemat fortsätter vid nästa hourly slot.
