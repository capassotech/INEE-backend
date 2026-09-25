import { toJsDate, ListFilterOption } from './listQuery';

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

const PENDING_STATUSES = new Set([
  'pending',
  'awaiting_paypal_proof',
  'awaiting_verification',
]);
const PAID_STATUSES = new Set(['paid', 'approved']);

/** Opciones del select admin: agrupa estados equivalentes en una sola opción. */
export const buildOrderFilterOptions = (
  docs: Array<{ status?: unknown }>
): { statuses: ListFilterOption[] } => {
  const rawStatuses = new Set<string>();
  for (const doc of docs) {
    if (doc.status) {
      rawStatuses.add(String(doc.status).toLowerCase());
    }
  }

  const options: ListFilterOption[] = [];
  const known = new Set([
    ...PENDING_STATUSES,
    ...PAID_STATUSES,
    'rejected',
    'cancelled',
  ]);

  if ([...rawStatuses].some((s) => PENDING_STATUSES.has(s))) {
    options.push({ value: 'pending', label: 'Pendiente' });
  }
  if ([...rawStatuses].some((s) => PAID_STATUSES.has(s))) {
    options.push({ value: 'paid', label: 'Pagado' });
  }
  if (rawStatuses.has('rejected')) {
    options.push({ value: 'rejected', label: 'Rechazado' });
  }
  if (rawStatuses.has('cancelled')) {
    options.push({ value: 'cancelled', label: 'Cancelado' });
  }

  for (const status of Array.from(rawStatuses).sort()) {
    if (!known.has(status)) {
      options.push({ value: status, label: status });
    }
  }

  return { statuses: options };
};

export const sortOrdersByCreatedAtDesc = <T extends Record<string, unknown>>(
  orders: T[]
): T[] =>
  [...orders].sort((a, b) => {
    const dateA = toJsDate(a.createdAt)?.getTime() ?? 0;
    const dateB = toJsDate(b.createdAt)?.getTime() ?? 0;
    return dateB - dateA;
  });
