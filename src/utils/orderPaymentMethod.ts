export const PAYMENT_METHOD_PAYPAL = 'paypal_manual';
export const PAYMENT_METHOD_MERCADOPAGO = 'mercadopago';

export type OrderPaymentMethod =
  | typeof PAYMENT_METHOD_PAYPAL
  | typeof PAYMENT_METHOD_MERCADOPAGO;

export const resolveOrderPaymentMethod = (
  order: Record<string, unknown>
): OrderPaymentMethod => {
  if (order.paymentMethod === PAYMENT_METHOD_PAYPAL) {
    return PAYMENT_METHOD_PAYPAL;
  }

  if (
    order.paymentMethod === PAYMENT_METHOD_MERCADOPAGO ||
    order.preferenceId ||
    order.paymentId
  ) {
    return PAYMENT_METHOD_MERCADOPAGO;
  }

  return PAYMENT_METHOD_MERCADOPAGO;
};

export const getPaymentMethodLabel = (method: OrderPaymentMethod): string =>
  method === PAYMENT_METHOD_PAYPAL ? 'PayPal' : 'Mercado Pago';

export const isPaypalManualOrder = (order: Record<string, unknown>): boolean =>
  resolveOrderPaymentMethod(order) === PAYMENT_METHOD_PAYPAL;
