import { firestore } from '../config/firebase';

export const registerDiscountCodeUsage = async (
  discountCode: string,
  userId: string,
  orderId: string,
  orderNumber: string,
  originalAmount: number,
  discountedAmount: number
): Promise<void> => {
  const existing = await firestore
    .collection('discount_code_usage')
    .where('orderId', '==', orderId)
    .limit(1)
    .get();

  if (!existing.empty) {
    return;
  }

  const discountCodeSnapshot = await firestore
    .collection('discount_codes')
    .where('codigo', '==', discountCode.toUpperCase().trim())
    .limit(1)
    .get();

  if (discountCodeSnapshot.empty) {
    console.warn(`Código de descuento ${discountCode} no encontrado`);
    return;
  }

  const discountCodeDoc = discountCodeSnapshot.docs[0];
  const discountData = discountCodeDoc.data();

  await firestore.collection('discount_code_usage').add({
    discountCodeId: discountCodeDoc.id,
    discountCode: discountCode.toUpperCase().trim(),
    discountPercentage: discountData.porcentaje || 0,
    userId,
    orderId,
    orderNumber,
    originalAmount,
    discountedAmount,
    savedAmount: originalAmount - discountedAmount,
    usedAt: new Date(),
    createdAt: new Date(),
  });
};
