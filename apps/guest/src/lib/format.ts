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
