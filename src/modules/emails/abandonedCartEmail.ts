import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface AbandonedCartItem {
  titulo: string;
  imagen?: string;
  /** Precio en pesos (ARS); si no hay, no se muestra */
  precio?: number;
  /** "Formación", "E-book" o "Evento" */
  tipo: string;
}

export interface SendAbandonedCartEmailParams {
  userEmail: string;
  userName: string;
  items: AbandonedCartItem[];
  cartUrl: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const formatArs = (value: number): string => `$${Math.round(value).toLocaleString('es-AR')}`;

const LOGO_URL =
  'https://firebasestorage.googleapis.com/v0/b/inee-admin.firebasestorage.app/o/Imagenes%2Flogo.png?alt=media&token=e46d276c-06d9-4b52-9d7e-33d85845cbb4';

/**
 * Email de "dejaste productos en el carrito".
 * Se envía una sola vez por período de inactividad del carrito (ver abandonedCartScheduler).
 */
export const sendAbandonedCartEmail = async ({
  userEmail,
  userName,
  items,
  cartUrl,
}: SendAbandonedCartEmailParams): Promise<boolean> => {
  if (items.length === 0) return false;

  const nombre = escapeHtml(userName || '');
  const single = items.length === 1;
  const subject = single
    ? `${userName ? `${userName}, t` : 'T'}u ${items[0].tipo.toLowerCase()} te está esperando`
    : `${userName ? `${userName}, t` : 'T'}e quedaron productos en el carrito`;

  const filas = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 0; width: 96px; vertical-align: middle;">
          ${
            item.imagen
              ? `<img src="${escapeHtml(item.imagen)}" alt="" width="84" style="display: block; width: 84px; height: 56px; object-fit: cover; border-radius: 8px;" />`
              : `<div style="width: 84px; height: 56px; border-radius: 8px; background: #f4f2f0;"></div>`
          }
        </td>
        <td style="padding: 10px 0 10px 12px; vertical-align: middle;">
          <p style="margin: 0; font-size: 12px; color: #B8892F; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(item.tipo)}</p>
          <p style="margin: 2px 0 0 0; font-size: 15px; font-weight: bold; color: #1f1f1f;">${escapeHtml(item.titulo)}</p>
          ${item.precio && item.precio > 0 ? `<p style="margin: 2px 0 0 0; font-size: 14px; color: #555;">${formatArs(item.precio)}</p>` : ''}
        </td>
      </tr>`
    )
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
      <p>Hola${nombre ? ` ${nombre}` : ''},</p>
      <p>${
        single
          ? 'Vimos que dejaste esta formación en tu carrito. Tu lugar sigue disponible:'
          : 'Vimos que dejaste estos productos en tu carrito. Siguen disponibles:'
      }</p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #eee; border-bottom: 1px solid #eee; margin: 16px 0;">
        ${filas}
      </table>

      <p style="text-align: center; margin: 28px 0;">
        <a href="${escapeHtml(cartUrl)}" style="display: inline-block; background: #8B3740; color: #ffffff; text-decoration: none; font-weight: bold; padding: 14px 32px; border-radius: 999px;">
          Completar mi compra
        </a>
      </p>

      <p style="font-size: 14px; color: #555;">
        Estudias 100% online, a tu ritmo y con certificación. Si tienes alguna duda antes de comprar, responde este email o
        escríbenos por <a href="https://api.whatsapp.com/send?phone=5493434513629" style="color: #8B3740;">WhatsApp</a> y te ayudamos.
      </p>

      <p style="margin-top: 28px; margin-bottom: 4px;"><strong>Equipo INEE®</strong></p>
      <div style="margin-top: 24px;">
        <img src="${LOGO_URL}" alt="INEE" style="max-width: 150px;" />
      </div>
      <p style="margin-top: 24px; font-size: 12px; color: #999;">
        Te enviamos este aviso una sola vez porque dejaste productos en tu carrito de ineeoficial.com.
        Si ya no te interesan, puedes quitarlos del carrito y no volveremos a escribirte por esto.
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: 'INEE Oficial <contacto@ineeoficial.com>',
    to: userEmail,
    replyTo: 'administracion@ineeoficial.com',
    subject,
    html,
  });

  if (error) {
    console.error('[Carrito abandonado] Error al enviar email:', error);
    return false;
  }
  return true;
};
