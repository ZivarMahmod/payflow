/**
 * Swish service — builds Swish deep links + QR codes for the private-QR
 * payment flow.
 *
 * Two adapter variants behind the same `SwishProvider` interface:
 *
 *   - `RealSwishProvider`: builds the spec-compliant `swish://payment?…`
 *     deep link from the restaurant's Swish number + amount + message.
 *     Pengarna går DIREKT till restaurangens Swish-konto — we never see
 *     them flow. Our job is the deep link, the QR, and the audit row.
 *
 *   - `MockSwishProvider`: returns `swish://mock?payment_id=…` which
 *     opens nothing on a real phone. The guest PWA shows a
 *     "🧪 Bekräfta som betald (mock)" button when VITE_USE_MOCK_SWISH
 *     is true, and that button calls POST /payments/:id/confirm with
 *     service-role token to simulate the webhook.
 *
 * Selector `makeSwishProvider(useMock)` picks one based on the
 * USE_MOCK_SWISH config flag. Consumed by routes/payments.ts at
 * request time — no module-level singleton, so tests can swap.
 *
 * Why we don't call a real Swish HTTP API: Swish Handel (the
 * merchant-facing API) requires a bank agreement that takes weeks.
 * MVP uses the private-QR flow which is a client-side-only deep link —
 * no backend integration required. See docs/mock-strategy.md §3.
 */

import QRCode from 'qrcode';

export interface SwishUrlInput {
  /**
   * Recipient's Swish number, e.g. '1231231231'. Format: 10 digits, no
   * spaces or dashes. Validated at the call site (restaurant settings
   * form + zod at ingest).
   */
  payeeNumber: string;
  /**
   * Amount in SEK, DECIMAL with two places. 42.50 → '42.50'.
   * We normalise to exactly two decimals in the URL regardless of input.
   */
  amount: number;
  /** Message pre-filled in the Swish app. Max ~50 chars for legibility. */
  message: string;
  /** Optional short reference code — if omitted, not added to URL. */
  reference?: string;
}

export interface SwishProvider {
  /** Build the `swish://payment?…` (or mock equivalent) deep link. */
  generateSwishUrl(input: SwishUrlInput): string;
  /**
   * Render the deep link as a scannable QR code, returned as a base64
   * data URL (`data:image/png;base64,…`). High error correction so the
   * QR survives printing + phone-camera scanning at an angle.
   */
  generateSwishQR(payload: string): Promise<string>;
}

/**
 * The real Swish private-QR deep link. Documented (loosely) at
 * https://developer.swish.nu/ — the shape used here matches what the
 * Swish app accepts when opened via a `swish://payment?data=…` URI.
 *
 * NOTE: `data` is a JSON string, URL-encoded. The JSON keys are the
 * Swish field names (swe_paynumber etc). Format mirrors what merchants
 * printing QR codes on receipts use.
 */
export class RealSwishProvider implements SwishProvider {
  generateSwishUrl(input: SwishUrlInput): string {
    const amountStr = input.amount.toFixed(2);

    // Swish accepts `swish://payment?data=<url-encoded-json>`. The JSON
    // shape matches what merchants printing QR codes on receipts use —
    // nested `{ value, editable }` objects per field so the app knows
    // which inputs the user can still tweak. We lock amount + message
    // so the guest can't edit them in the Swish app and short-pay.
    const json = JSON.stringify({
      version: '1',
      payee: { value: input.payeeNumber },
      amount: { value: amountStr, editable: false },
      message: { value: input.message, editable: false },
      ...(input.reference ? { reference: { value: input.reference } } : {}),
    });

    return `swish://payment?data=${encodeURIComponent(json)}`;
  }

  async generateSwishQR(payload: string): Promise<string> {
    // High error-correction level so restaurant-printed QRs survive
    // creasing. 256px is plenty for phone-camera scanning at arm's length.
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffffff',
      },
    });
  }
}

/**
 * Mock Swish provider — opens nothing on a real phone. Used when
 * USE_MOCK_SWISH=true. Guest app (apps/guest) renders a fallback
 * "Bekräfta som betald (mock)" button that POSTs to /payments/:id/confirm.
 */
export class MockSwishProvider implements SwishProvider {
  generateSwishUrl(input: SwishUrlInput): string {
    // Include amount + reference so tests can assert values from the URL.
    const params = new URLSearchParams({
      payee: input.payeeNumber,
      amount: input.amount.toFixed(2),
      message: input.message,
      ...(input.reference ? { reference: input.reference } : {}),
    });
    return `swish://mock?${params.toString()}`;
  }

  async generateSwishQR(payload: string): Promise<string> {
    // Still render a real QR — the guest PWA shows it, so mock-mode
    // behaviour matches prod visually. The QR encodes the mock URL,
    // which is inert when scanned.
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      width: 256,
      margin: 2,
    });
  }
}

/** Factory — pick the provider based on the USE_MOCK_SWISH config flag. */
export function makeSwishProvider(useMock: boolean): SwishProvider {
  return useMock ? new MockSwishProvider() : new RealSwishProvider();
}

/**
 * Generate a short human-readable reference for the payment row. Shown
 * in the Swish app dialog + used by restaurant staff for manual
 * reconciliation if Tink Open Banking isn't hooked up yet.
 *
 * Format: `FP-` + 6 base36 chars from crypto.getRandomValues — ~31 bits,
 * enough to distinguish a restaurant's daily transactions without being
 * a guessing target (the reference isn't a secret anyway).
 */
export function generateReference(): string {
  // Use Web Crypto — available on modern Node without imports.
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  let n = 0;
  for (const b of bytes) n = (n * 256 + b) >>> 0;
  const tail = n.toString(36).toUpperCase().padStart(6, '0').slice(-6);
  return `FP-${tail}`;
}

/**
 * Build the message shown in the Swish app, constrained to ~50 chars.
 * We pack the order-token prefix so the restaurant can match a Swish
 * payment back to an order_cache row manually.
 */
export function buildSwishMessage(orderToken: string, reference: string): string {
  // orders_cache.order_token is a 32-char hex — first 8 chars is
  // plenty of entropy for human matching.
  const tokenPrefix = orderToken.slice(0, 8);
  return `FlowPay ${reference} / ${tokenPrefix}`;
}
