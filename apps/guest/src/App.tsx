import { Navigate, Route, Routes } from 'react-router-dom';
import { FeedbackRoute } from './routes/feedback';
import { OrderRoute } from './routes/order';
import { PaymentRoute } from './routes/payment';
import { SplitRoute } from './routes/split';
import { SuccessRoute } from './routes/success';
import { NotFoundRoute } from './routes/not-found';

/**
 * Guest app router.
 *
 * The guest lands via QR at `/t/:slug/:tableId?order=<token>`. The slug is the
 * tenant (restaurant), `tableId` identifies the physical table, `order` is the
 * POS-issued opaque token that scopes the bill view.
 *
 * Child paths keep the slug/tableId segments so deep-link refresh works
 * and back-navigation is predictable:
 *   - `/t/:slug/:tableId`         → bill view (OrderRoute)
 *   - `/t/:slug/:tableId/pay`     → payment flow (PaymentRoute)
 *   - `/t/:slug/:tableId/success`  → post-payment (SuccessRoute)
 *   - `/t/:slug/:tableId/feedback?payment=<id>` → post-payment feedback (KI-007)
 *
 * Any other path is a QR-scan mistake (wrong venue, old flyer, etc.) — we
 * surface a friendly fallback instead of a raw 404.
 */
export function App() {
  return (
    <Routes>
      <Route path="/t/:slug/:tableId" element={<OrderRoute />} />
      <Route path="/t/:slug/:tableId/split" element={<SplitRoute />} />
      <Route path="/t/:slug/:tableId/pay" element={<PaymentRoute />} />
      <Route path="/t/:slug/:tableId/success" element={<SuccessRoute />} />
      <Route path="/t/:slug/:tableId/feedback" element={<FeedbackRoute />} />
      <Route path="/" element={<NotFoundRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
