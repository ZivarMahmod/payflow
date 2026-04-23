/**
 * SwishQR — the "sanning-ögonblicket" component.
 *
 * Shows:
 *  1. The Swish-bank QR code (scannable from another phone).
 *  2. A big "Öppna Swish" button that deep-links into the Swish app.
 *  3. The payment reference (FP-XXXX) so the guest can sanity-check.
 *
 * Constraints from BRIEF-KI-003:
 *  - QR must be ≥ 250×250px so it scans at arm's length.
 *  - "Öppna Swish" MUST be a user-gesture handler — iOS blocks deep-link
 *    nav from timers/effects. So we render it as a plain `<a href>` with
 *    the deep link, which browsers treat as a user-gesture click. We do
 *    NOT `router.push(swish_url)` in an effect — that path silently fails
 *    on Safari and breaks trust in the first five seconds of the flow.
 *  - Never auto-open Swish. Let the guest tap.
 *
 * The API returns `qr_data_url` already encoded as a `data:` URL — we just
 * render it. That keeps the browser bundle free of a QR library (the API
 * owns encoding with `qrcode`, per BRIEF-API-003).
 */

import { Card, Stack, buttonStyles } from '@flowpay/ui';

interface SwishQRProps {
  /** `data:image/png;base64,…` (or svg+xml) from the API. */
  qrDataUrl: string;
  /** `swish://payment?…` deep link. Drives the "Öppna Swish" button. */
  swishUrl: string;
  /** Short human-readable reference — shown as "Ref: FP-ABCD". */
  reference: string;
}

export function SwishQR({ qrDataUrl, swishUrl, reference }: SwishQRProps) {
  return (
    <Card padding="md">
      <Stack gap={4}>
        <div className="flex flex-col items-center gap-3">
          <img
            src={qrDataUrl}
            alt="Swish-QR-kod — skanna med en annan mobil"
            width={260}
            height={260}
            className="block h-[260px] w-[260px] rounded-md bg-white p-2"
            // QR contrast relies on white bg — force it even in dark mode.
            style={{ imageRendering: 'pixelated' }}
          />
          <p className="text-center text-sm text-graphite">
            Skanna med en annan mobil — eller tryck nedan för att öppna Swish
            direkt.
          </p>
        </div>

        {/*
          Anchor styled as a button — NOT <a><button/></a> (invalid nested
          interactives). iOS requires a user-gesture for custom-scheme
          navigation to fire. `<a href="swish://…">` counts as that gesture.
          `target="_self"` avoids popup-blocked behaviour on Android Chrome.
          rel="noopener" is a good hygiene default even for non-http schemes.
        */}
        <a
          href={swishUrl}
          target="_self"
          rel="noopener"
          aria-label="Öppna Swish-appen för att betala"
          className={buttonStyles({ variant: 'primary', size: 'lg', block: true })}
        >
          Öppna Swish
        </a>

        <p className="text-center text-xs text-graphite">
          Ref: <span className="font-mono tabular-nums">{reference}</span>
        </p>
      </Stack>
    </Card>
  );
}
