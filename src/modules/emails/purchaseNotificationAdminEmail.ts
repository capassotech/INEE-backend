import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export type ResourceTypeLabel = 'curso' | 'evento' | 'ebook' | 'recursos';

const resourceTypeLabels: Record<ResourceTypeLabel, { singular: string; plural: string }> = {
  curso: { singular: 'Formación', plural: 'Formaciones' },
  evento: { singular: 'Evento', plural: 'Eventos' },
  ebook: { singular: 'Ebook', plural: 'Ebooks' },
  recursos: { singular: 'Recurso', plural: 'Recursos' },
};

export interface ItemsByType {
  curso?: string[];
  evento?: string[];
  ebook?: string[];
}

export interface SendPurchaseNotificationAdminEmailParams {
  userName: string;
  userEmail: string;
  userId: string;
  orderNumber: string;
  totalPaid: number;
  originalPrice?: number;
  discountCode?: string;
  resourceType: ResourceTypeLabel;
  resourceTitles: string[];
  itemsByType?: ItemsByType;
}

const renderListaItems = (titles: string[]): string =>
  titles
    .map((title) => `<li style="margin-bottom: 6px;">• ${title}</li>`)
    .join('');

/** Genera el HTML de la lista cuando hay compra mixta. */
const renderListaPorTipo = (itemsByType: ItemsByType): string => {
  const secciones: string[] = [];
  const tipoLabels: { key: keyof ItemsByType; labelSingular: string; labelPlural: string }[] = [
    { key: 'curso', labelSingular: 'Formación', labelPlural: 'Formaciones' },
    { key: 'evento', labelSingular: 'Evento', labelPlural: 'Eventos' },
    { key: 'ebook', labelSingular: 'Ebook', labelPlural: 'Ebooks' },
  ];
  
  for (const { key, labelSingular, labelPlural } of tipoLabels) {
    const titulos = itemsByType[key];
    if (!titulos?.length) continue;
    const label = titulos.length === 1 ? labelSingular : labelPlural;
    const lista = renderListaItems(titulos);
    secciones.push(`
    <p style="margin: 12px 0 4px 0; font-weight: bold; color: #333;">${label}:</p>
    <ul style="list-style: none; padding-left: 16px; margin: 0 0 8px 0; color: #555;">
      ${lista}
    </ul>`);
  }
  
  return secciones.join('');
};


export const sendPurchaseNotificationAdminEmail = async ({
  userName,
  userEmail,
  userId,
  orderNumber,
  totalPaid,
  originalPrice,
  discountCode,
  resourceType,
  resourceTitles,
  itemsByType,
}: SendPurchaseNotificationAdminEmailParams): Promise<void> => {
  const hasItemsByType =
    itemsByType &&
    ((itemsByType.curso?.length ?? 0) + (itemsByType.evento?.length ?? 0) + (itemsByType.ebook?.length ?? 0) > 0);
  const useListaPorTipo = resourceType === 'recursos' && !!hasItemsByType;

  const totalItems = useListaPorTipo
    ? (itemsByType!.curso?.length || 0) + (itemsByType!.evento?.length || 0) + (itemsByType!.ebook?.length || 0)
    : resourceTitles.length;

  if (totalItems === 0) {
    console.warn('sendPurchaseNotificationAdminEmail: sin ítems, no se envía email');
    return;
  }

  const labels = resourceTypeLabels[resourceType];
  const isSingle = totalItems === 1;

  // Generar lista de productos
  const listaProductos = useListaPorTipo
    ? renderListaPorTipo(itemsByType!)
    : `<ul style="list-style: none; padding-left: 16px; color: #555;">${renderListaItems(resourceTitles)}</ul>`;

  // Información de descuento
  const descuentoInfo = discountCode && originalPrice && originalPrice > totalPaid
    ? `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">Precio Original:</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #555;">ARS $${originalPrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">Código de Descuento:</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #00a650; font-weight: bold;">${discountCode}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">Descuento Aplicado:</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #d32f2f;">-ARS $${(originalPrice - totalPaid).toFixed(2)}</td>
        </tr>
      `
    : '';

  const subject = `Nueva compra: ${userName} - ${orderNumber}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; line-height: 1.6; color: #333;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px 0; color: #1a73e8;">🛒 Nueva Compra Realizada</h2>
        <p style="margin: 0; color: #666; font-size: 14px;">Orden: <strong>${orderNumber}</strong></p>
      </div>

      <div style="background-color: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px 0; color: #333; border-bottom: 2px solid #1a73e8; padding-bottom: 8px;">Información del Cliente</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #333; width: 180px;">Nombre:</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #555;">${userName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">Email:</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #555;">${userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">ID Usuario:</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #555; font-family: monospace; font-size: 12px;">${userId}</td>
          </tr>
        </table>
      </div>

      <div style="background-color: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px 0; color: #333; border-bottom: 2px solid #1a73e8; padding-bottom: 8px;">
          ${isSingle ? labels.singular : labels.plural} ${isSingle ? 'Adquirida' : 'Adquiridos'}
        </h3>
        ${listaProductos}
      </div>

      <div style="background-color: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px;">
        <h3 style="margin: 0 0 16px 0; color: #333; border-bottom: 2px solid #1a73e8; padding-bottom: 8px;">Detalles de Pago</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${descuentoInfo}
          <tr>
            <td style="padding: 12px 12px; font-weight: bold; color: #333; font-size: 16px;">Total Pagado:</td>
            <td style="padding: 12px 12px; color: #00a650; font-weight: bold; font-size: 18px;">ARS $${totalPaid.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center;">
        <p style="margin: 0; color: #999; font-size: 12px;">Este es un email automático de notificación del sistema INEE®</p>
      </div>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: 'INEE Sistema <sistema@ineeoficial.com>',
      to: 'admin@ineeoficial.com',
      subject,
      html,
    });

    if (error) console.error('❌ Error al enviar email de notificación a administradores:', error);
  } catch (error) {
    console.error('❌ Error al enviar email de notificación a administradores:', error);
  }
};
