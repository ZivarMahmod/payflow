import { Card, Stack } from '@flowpay/ui';

/**
 * Landing shown when someone opens the guest app without a valid route.
 * Could happen if a flyer's QR was corrupted, a marketing link was shared
 * out of context, or the user typed `flowpay.app` directly.
 */
export function NotFoundRoute() {
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-10 text-ink">
      <Card padding="md">
        <Stack gap={4}>
          <h1 className="text-xl font-semibold">FlowPay</h1>
          <p className="text-graphite">
            Den här sidan öppnas när du skannar restaurangens QR-kod. Leta efter
            koden på bordet — då laddar vi din nota automatiskt.
          </p>
        </Stack>
      </Card>
    </main>
  );
}
