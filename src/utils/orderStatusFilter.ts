import { toJsDate } from './listQuery';

/** Estados que requieren filtrado en memoria (agrupan varios valores de Firestore). */
export const GROUPED_ORDER_STATUS_FILTERS = new Set(['pending']);

export const isGroupedOrderStatusFilter = (status?: string): boolean =>
  !!status && GROUPED_ORDER_STATUS_FILTERS.has(status.toLowerCase());

export const orderMatchesStatusFilter = (
  orderStatus: unknown,
  filterStatus: string
): boolean => {
  const status = String(orderStatus || '').toLowerCase();
  const filter = filterStatus.toLowerCase();

  switch (filter) {
    case 'pending':
      return [
        'pending',
        'awaiting_paypal_proof',
        'awaiting_verification',
      ].includes(status);
    case 'paid':
      return status === 'paid';
    case 'approved':
      return status === 'approved';
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
