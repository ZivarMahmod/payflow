import { Navigate, Route, Routes } from 'react-router-dom';
import { OrderRoute } from './routes/order';
import { NotFoundRoute } from './routes/not-found';

/**
 * Guest app router.
 *
 * The guest lands via QR at `/t/:slug/:tableId?order=<token>`. The slug is the
 * tenant (restaurant), `tableId` identifies the physical table, `order` is the
 * POS-issued opaque token that scopes the bill view.
 *
 * Any other path is a QR-scan mistake (wrong venue, old flyer, etc.) — we
 * surface a friendly fallback instead of a raw 404.
 */
export function App() {
  return (
    <Routes>
      <Route path="/t/:slug/:tableId" element={<OrderRoute />} />
      <Route path="/" element={<NotFoundRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
