/**
 * POS adapter registry — one place to look up "give me a provider for
 * type X". The sync scheduler uses this; production code should never
 * import an adapter directly.
 */

import { caspecoFactory } from './caspeco/index.js';
import { onslipFactory } from './onslip/index.js';
import type { POSProvider, POSProviderFactory, PosType } from './types.js';

export * from './types.js';

const factories: Record<PosType, POSProviderFactory | undefined> = {
  onslip: onslipFactory,
  caspeco: caspecoFactory,
  // Filled in by subsequent briefs.
  lightspeed: undefined,
};

export function getPOSProvider(type: PosType, opts: { mock?: boolean } = {}): POSProvider {
  const factory = factories[type];
  if (!factory) {
    throw new Error(`POS provider "${type}" is not registered. Known: ${Object.keys(factories)
      .filter((k) => factories[k as PosType])
      .join(', ')}`);
  }
  return factory.create(opts);
}

export function registerPOSProvider(factory: POSProviderFactory): void {
  factories[factory.type] = factory;
}
