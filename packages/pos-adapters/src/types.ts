/**
 * POS adapter contract — every POS (Onslip, Caspeco, Lightspeed …)
 * implements `POSProvider`. The sync service, webhooks, and the payment
 * completion flow all speak this interface, never a POS-specific one.
 *
 * Anti-pattern reminder from POS-001:
 *   - No POS-specific logic outside the adapter.
 *   - Never write to the POS beyond `markOrderPaid`.
 */

export type PosType = 'onslip' | 'caspeco' | 'lightspeed';

export interface POSOrderItem {
  name: string;
  qty: number;
  /** Per-unit price in currency minor units as decimal (e.g. 125.00 = 125 SEK). */
  unitPrice: number;
}

export interface POSOrder {
  /** ID as known by the POS. Stable — we use this for upsert. */
  externalId: string;
  /** Table label (POS-specific string; may be null for takeaway). */
  tableNumber: string | null;
  /** Full bill total including VAT. In SEK unless the POS says otherwise. */
  total: number;
  /** ISO 4217 code; Onslip always returns 'SEK', we keep it on the order for forwards compat. */
  currency: string;
  /** Line items. Shape is normalised by the adapter. */
  items: POSOrderItem[];
  /** When the bill was opened in the POS. */
  openedAt: Date;
  /** POS considers this bill closed — we should mark cache.status = 'closed'. */
  closed?: boolean;
}

export interface POSMarkPaidInput {
  /** Payment method, as we booked it in our own `payments` table. */
  method: 'swish' | 'card';
  /** Amount excluding tip. The POS books tip separately if it cares. */
  amount: number;
  tipAmount?: number;
  /** Our provider's transaction id (Swish reference, Stripe charge id). */
  reference: string;
}

/**
 * Every adapter must implement these. `fetchTables` is optional — used
 * by the admin console to enumerate physical tables during onboarding;
 * not every POS exposes it.
 */
export interface POSProvider {
  readonly type: PosType;

  /** Validate credentials. Throws on failure. */
  authenticate(creds: POSCredentials): Promise<void>;

  /** All bills currently "open" at this location. */
  fetchOpenOrders(externalLocationId: string): Promise<POSOrder[]>;

  /** Single bill lookup by external id. Used for reconciliation. */
  fetchOrder(externalLocationId: string, externalOrderId: string): Promise<POSOrder>;

  /** Tell the POS a bill is paid. One-way write — the only mutation we ever do. */
  markOrderPaid(
    externalLocationId: string,
    externalOrderId: string,
    payment: POSMarkPaidInput,
  ): Promise<void>;

  /** Optional: fetch the table list so admin UI can match them to our `tables` rows. */
  fetchTables?(externalLocationId: string): Promise<Array<{ number: string }>>;
}

/**
 * Credentials blob. Shape is adapter-defined — Onslip uses an API key,
 * Caspeco uses OAuth client id + secret. The caller passes it through
 * from Vault without looking at the content.
 */
export type POSCredentials = Record<string, string>;

export interface POSProviderFactory {
  readonly type: PosType;
  create(opts: { mock?: boolean }): POSProvider;
}

/**
 * Errors thrown by adapters carry a stable `code` so the sync scheduler
 * can decide whether to retry, back off, or flip status='error'.
 */
export class POSAdapterError extends Error {
  public readonly code: POSErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;

  constructor(
    code: POSErrorCode,
    message: string,
    opts: { retryable?: boolean; status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'POSAdapterError';
    this.code = code;
    this.retryable = opts.retryable ?? false;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export type POSErrorCode =
  | 'AUTH_FAILED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_ERROR'
  | 'BAD_RESPONSE'
  | 'UNSUPPORTED';
