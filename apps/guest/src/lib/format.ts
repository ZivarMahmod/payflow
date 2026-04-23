/**
 * Formatting helpers. Anything that renders an amount or a date to the guest
 * routes through here so we don't leak öre-math or locale choices into views.
 */

/**
 * Format an amount in öre as a Swedish SEK string.
 *
 *   formatOre(18500)  // "185,00 kr"
 *   formatOre(77500)  // "775,00 kr"
 *
 * We render SEK explicitly (Intl renders "kr" without the SEK code) so there
 * is no ambiguity when the app later supports NOK/DKK venues.
 */
const SEK_FORMATTER = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
  currencyDisplay: 'symbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatOre(amountOre: number): string {
  return SEK_FORMATTER.format(amountOre / 100);
}

/**
 * Format a decimal SEK amount (as the API returns it — NUMERIC(10,2)).
 *
 *   formatAmount(185)    // "185,00 kr"
 *   formatAmount(487.5)  // "487,50 kr"
 *
 * Used by KI-002 onwards. `formatOre` is kept for the legacy fixture path
 * until we unify the client on a single money representation.
 */
export function formatAmount(amount: number, currency = 'SEK'): string {
  // Cache by currency to avoid re-constructing Intl.NumberFormat on every call.
  const formatter = getAmountFormatter(currency);
  return formatter.format(amount);
}

const AMOUNT_FORMATTER_CACHE = new Map<string, Intl.NumberFormat>();
function getAmountFormatter(currency: string): Intl.NumberFormat {
  const cached = AMOUNT_FORMATTER_CACHE.get(currency);
  if (cached) return cached;
  const fmt = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  AMOUNT_FORMATTER_CACHE.set(currency, fmt);
  return fmt;
}
