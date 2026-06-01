import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface PaypalProofOrderItem {
  title?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
}

export interface SendPaypalProofSubmittedAdminEmailParams {
  userName: string;
  userEmail: string;
  userId: string;
  orderId: string;
  orderNumber: string;
  totalPrice: number;
  originalPrice?: number;
  discountCode?: string;
  proofUrl: string;
  adminOrderDetailUrl: string;
  items?: PaypalProofOrderItem[];
}

const renderOrderItems = (items: PaypalProofOrderItem[]): string => {
  if (!items.length) {
    return '<p style="color: #666;">Sin detalle de ítems</p>';
  }

  return `<ul style="list-style: none; padding-left: 0; margin: 0; color: #555;">
    ${items
      .map((item) => {
        const title = item.title || item.description || 'Producto';
        const qty = item.quantity ?? 1;
        const unitPrice = item.unit_price ?? 0;
        return `<li style="margin-bottom: 8px;">• ${title} (x${qty}) — ARS $${Number(unitPrice).toFixed(2)}</li>`;
      })
      .join('')}
  </ul>`;
};

export const sendPaypalProofSubmittedAdminEmail = async ({
  userName,
  userEmail,
  userId,
  orderId,
  orderNumber,
  totalPrice,
  originalPrice,
  discountCode,
  proofUrl,
  adminOrderDetailUrl,
  items = [],
}: SendPaypalProofSubmittedAdminEmailParams): Promise<void> => {
  const adminEmail =
    process.env.PAYPAL_PROOF_ADMIN_EMAIL ||
    process.env.PAYPAL_PROOF_EMAIL ||
    'administracion@ineeoficial.com';

  const discountInfo =
    discountCode && originalPrice && originalPrice > totalPrice
      ? `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold;">Precio original:</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">ARS $${originalPrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold;">Código de descuento:</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #00a650;">${discountCode}</td>
        </tr>
      `
      : '';

  const subject = `Comprobante PayPal recibido - ${orderNumber}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; line-height: 1.6; color: #333;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px 0; color: #1a73e8;">Comprobante de pago PayPal</h2>
        <p style="margin: 0; color: #666; font-size: 14px;">Orden: <strong>${orderNumber}</strong></p>
      </div>

      <div style="background-color: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px 0; border-bottom: 2px solid #1a73e8; padding-bottom: 8px;">Datos del usuario</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; width: 160px;">Nombre:</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${userName || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold;">ID usuario:</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 12px;">${userId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold;">ID orden:</td>
            <td style="padding: 8px 12px; font-family: monospace; font-size: 12px;">${orderId}</td>
          </tr>
        </table>
      </div>

      <div style="background-color: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px 0; border-bottom: 2px solid #1a73e8; padding-bottom: 8px;">Detalle de la compra</h3>
        ${renderOrderItems(items)}
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          ${discountInfo}
          <tr>
            <td style="padding: 12px 12px; font-weight: bold; font-size: 16px;">Total:</td>
            <td style="padding: 12px 12px; color: #00a650; font-weight: bold; font-size: 18px;">ARS $${totalPrice.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="background-color: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px 0;">Comprobante</h3>
        <p style="margin: 0 0 12px 0; color: #555;">El archivo fue guardado en Firebase Storage. Podés verlo desde este enlace:</p>
        <p style="margin: 0;">
          <a href="${proofUrl}" style="color: #1a73e8; word-break: break-all;">Ver comprobante</a>
        </p>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${adminOrderDetailUrl}"
           style="display: inline-block; background-color: #1a73e8; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold;">
          Ver orden en el admin
        </a>
      </div>

      <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
        Email automático del sistema INEE® — estado de la orden: awaiting_verification
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: 'INEE Sistema <sistema@ineeoficial.com>',
    to: adminEmail,
    subject,
    html,
  });

  if (error) {
    throw new Error(
      `Error al enviar email de comprobante PayPal a INEE: ${JSON.stringify(error)}`
    );
  }
};
