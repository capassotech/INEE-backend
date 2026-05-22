import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface PaypalReminderOrderItem {
  title?: string;
  description?: string;
  name?: string;
  quantity?: number;
}

export interface SendPaypalProofReminderEmailParams {
  userName: string;
  userEmail: string;
  orderNumber: string;
  proofEmail: string;
  items?: unknown[];
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const getItemLabel = (item: PaypalReminderOrderItem): string => {
  const label = (item.title || item.description || item.name || 'Producto').trim();
  const qty = typeof item.quantity === 'number' && item.quantity > 1 ? ` (x${item.quantity})` : '';
  return `${label}${qty}`;
};

export const buildOrderItemsSummaryHtml = (items: unknown[]): string => {
  if (!Array.isArray(items) || items.length === 0) return '';

  const listItems = items
    .map((raw) => getItemLabel(raw as PaypalReminderOrderItem))
    .map((label) => `<li style="margin-bottom: 4px;">${escapeHtml(label)}</li>`)
    .join('');

  return `
      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 14px 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0; font-weight: bold; color: #333; font-size: 14px;">Recordá qué compraste:</p>
        <ul style="margin: 0; padding-left: 18px; color: #555; font-size: 14px;">${listItems}</ul>
      </div>
    `;
};

export const sendPaypalProofReminderEmail = async ({
  userName,
  userEmail,
  orderNumber,
  proofEmail,
  items = [],
}: SendPaypalProofReminderEmailParams): Promise<void> => {
  const subject = `Recordatorio: enviá tu comprobante de PayPal - Orden ${orderNumber}`;
  const purchaseSummaryHtml = buildOrderItemsSummaryHtml(items);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
      <p>Hola ${escapeHtml(userName || 'estudiante')},</p>

      <p>Detectamos que iniciaste una compra con <strong>PayPal</strong> (orden <strong>${escapeHtml(orderNumber)}</strong>), pero todavía no recibimos el comprobante de pago.</p>

      ${purchaseSummaryHtml}

      <p>Para que podamos validar tu compra y habilitar el acceso a tus contenidos, envianos el comprobante por email a
        <a href="mailto:${proofEmail}" style="color: #1a73e8; text-decoration: none;"><strong>${escapeHtml(proofEmail)}</strong></a>,
        indicando tu número de orden (<strong>${escapeHtml(orderNumber)}</strong>).</p>

      <p>También podés responder a este correo adjuntando el comprobante.</p>

      <p style="margin-top: 24px;">Si ya enviaste el comprobante, podés ignorar este mensaje. Lo revisaremos a la brevedad.</p>

      <p style="margin-top: 28px; margin-bottom: 4px;"><strong>Equipo INEE®</strong></p>

      <div style="margin-top: 30px;">
        <img src="https://firebasestorage.googleapis.com/v0/b/inee-admin.firebasestorage.app/o/Imagenes%2Flogo.png?alt=media&token=e46d276c-06d9-4b52-9d7e-33d85845cbb4" alt="INEE Logo" style="max-width: 150px;" />
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: 'INEE Oficial <contacto@ineeoficial.com>',
    to: userEmail,
    replyTo: proofEmail,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Error al enviar email de recordatorio PayPal: ${JSON.stringify(error)}`);
  }
};
