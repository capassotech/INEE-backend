import {
  getPaymentMethodLabel,
  isPaypalManualOrder,
  resolveOrderPaymentMethod,
} from './orderPaymentMethod';

export const enrichOrderResponse = <T extends Record<string, unknown>>(
  order: T
) => {
  const paymentMethod = resolveOrderPaymentMethod(order);
  const paypalManual = isPaypalManualOrder(order);
  const hasItems =
    Array.isArray(order.items) && (order.items as unknown[]).length > 0;
  const productsAlreadyAssigned = !!order.productsAssignedAt;

  return {
    ...order,
    paymentMethod,
    paymentMethodLabel: getPaymentMethodLabel(paymentMethod),
    isPaypalManual: paypalManual,
    adminActions: {
      canChangeStatus: paypalManual,
      canAssignProducts: paypalManual && !!order.userId && hasItems,
      productsAlreadyAssigned,
    },
  };
};
