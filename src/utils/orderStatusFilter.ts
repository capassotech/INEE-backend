import { toJsDate } from './listQuery';

/** Estados que requieren filtrado en memoria (agrupan varios valores de Firestore). */
export const GROUPED_ORDER_STATUS_FILTERS = new Set([
  'pending',
  'paid',
  'approved',
]);

export const isGroupedOrderStatusFilter = (status?: string): boolean =>
  !!status && GROUPED_ORDER_STATUS_FILTERS.has(status.toLowerCase());

/** Misma lógica que el dashboard: pedido pagado/aprobado. */
export const isPaidOrApprovedOrder = (order: Record<string, unknown>): boolean => {
  const status = String(order.status || '').toLowerCase();
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  const paymentDetails = (order.paymentDetails || {}) as Record<string, unknown>;
  const statusDetail = String(paymentDetails.status_detail || '').toLowerCase();

  return (
    status === 'paid' ||
    status === 'approved' ||
    paymentStatus === 'approved' ||
    statusDetail === 'accredited'
  );
};

export const orderMatchesStatusFilter = (
  order: Record<string, unknown>,
  filterStatus: string
): boolean => {
  const status = String(order.status || '').toLowerCase();
  const filter = filterStatus.toLowerCase();

  switch (filter) {
    case 'pending':
      return [
        'pending',
        'awaiting_paypal_proof',
        'awaiting_verification',
      ].includes(status);
    case 'paid':
    case 'approved':
      return isPaidOrApprovedOrder(order);
    case 'cancelled':
      return status === 'cancelled';
    case 'rejected':
      return status === 'rejected';
    default:
      return status === filter;
  }
};

export const sortOrdersByCreatedAtDesc = <T extends Record<string, unknown>>(
  orders: T[]
): T[] =>
  [...orders].sort((a, b) => {
    const dateA = toJsDate(a.createdAt)?.getTime() ?? 0;
    const dateB = toJsDate(b.createdAt)?.getTime() ?? 0;
    return dateB - dateA;
  });
