import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export type ResourceTypeEmail = 'curso' | 'evento' | 'ebook' | 'recursos';

const resourceTypeLabels: Record<ResourceTypeEmail, {
  singular: string;
  plural: string;
  articulo: string;
  articuloPlural: string;
  participioSingular: string;
  participioPlural: string;
  subjectSingular: string;
  subjectPlural: string;
  accesoLabel: string;
}> = {
  curso: {
    singular: 'formación',
    plural: 'formaciones',
    articulo: 'La',
    articuloPlural: 'Las',
    participioSingular: 'asignada',
    participioPlural: 'asignadas',
    subjectSingular: 'Tu formación ya está disponible en INEE®',
    subjectPlural: 'Tus formaciones ya están disponibles en INEE®',
    accesoLabel: 'formaciones',
  },
  evento: {
    singular: 'evento',
    plural: 'eventos',
    articulo: 'El',
    articuloPlural: 'Los',
    participioSingular: 'asignado',
    participioPlural: 'asignados',
    subjectSingular: 'Tu evento ya está disponible en INEE®',
    subjectPlural: 'Tus eventos ya están disponibles en INEE®',
    accesoLabel: 'eventos',
  },
  ebook: {
    singular: 'ebook',
    plural: 'ebooks',
    articulo: 'El',
    articuloPlural: 'Los',
    participioSingular: 'asignado',
    participioPlural: 'asignados',
    subjectSingular: 'Tu ebook ya está disponible en INEE®',
    subjectPlural: 'Tus ebooks ya están disponibles en INEE®',
    accesoLabel: 'ebooks',
  },
  recursos: {
    singular: 'recurso',
    plural: 'recursos',
    articulo: 'El',
    articuloPlural: 'Los',
    participioSingular: 'asignado',
    participioPlural: 'asignados',
    subjectSingular: 'Tu recurso ya está disponible en INEE®',
    subjectPlural: 'Tus recursos ya están disponibles en INEE®',
    accesoLabel: 'recursos',
  },
};

/** Items agrupados por tipo para compras mixtas (formación + evento + ebook). */
export interface ItemsByType {
  curso?: string[];
  evento?: string[];
  ebook?: string[];
}

export interface SendResourceAvailableEmailParams {
  userEmail: string;
  userName: string;
  resourceType: ResourceTypeEmail;
  resourceTitles: string[];
  /** Cuando resourceType es 'recursos', opcionalmente se envían ítems por tipo para listar con etiqueta (Formación / Evento / Ebook). */
  itemsByType?: ItemsByType;
}

const renderListaItems = (titles: string[]): string =>
  titles
    .map(
      (title) => `
    <li style="margin-bottom: 8px;">
      <span style="color: #00a650; font-size: 18px; margin-right: 8px;">✅</span>
      <strong>${title}</strong>
    </li>`
    )
    .join('');

/** Genera el HTML de la lista cuando hay compra mixta: secciones "Formación:", "Evento:", "Ebook:" con sus ítems. */
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
    <p style="margin: 16px 0 6px 0; font-weight: bold; color: #333;">${label}:</p>
    <ul style="list-style: none; padding-left: 0; margin: 0 0 8px 0;">
      ${lista}
    </ul>`);
  }
  return secciones.join('');
}

/**
 * Envía un email unificado de "recurso disponible en el campus",
 * tanto para asignación desde el panel de administrador como para compra desde la tienda.
 * Formato y firma institucional consistentes para eventos, formaciones y ebooks.
 * En compras mixtas (resourceType 'recursos' + itemsByType) se listan los ítems por tipo con etiqueta.
 */
export const sendResourceAvailableEmail = async ({
  userEmail,
  userName,
  resourceType,
  resourceTitles,
  itemsByType,
}: SendResourceAvailableEmailParams): Promise<void> => {
  const hasItemsByType =
    itemsByType &&
    ((itemsByType.curso?.length ?? 0) + (itemsByType.evento?.length ?? 0) + (itemsByType.ebook?.length ?? 0) > 0);
  const useListaPorTipo = resourceType === 'recursos' && !!hasItemsByType;

  const totalItems = useListaPorTipo
    ? (itemsByType!.curso?.length || 0) + (itemsByType!.evento?.length || 0) + (itemsByType!.ebook?.length || 0)
    : resourceTitles.length;

  if (totalItems === 0) {
    console.warn('sendResourceAvailableEmail: sin ítems, no se envía email');
    return;
  }

  const labels = resourceTypeLabels[resourceType];
  const isSingle = totalItems === 1;

  const subject = isSingle ? labels.subjectSingular : labels.subjectPlural;

  // Título del primer ítem (para redacción singular: "La Formación en [nombre] ya fue asignada...")
  const primerTitulo =
    useListaPorTipo && itemsByType
      ? (itemsByType.curso?.[0] ?? itemsByType.evento?.[0] ?? itemsByType.ebook?.[0] ?? '')
      : resourceTitles[0] ?? '';

  const textoIntro = isSingle
    ? `${labels.articulo} ${labels.singular.charAt(0).toUpperCase() + labels.singular.slice(1)} <strong>${primerTitulo}</strong> ya fue ${labels.participioSingular} a tu perfil en INEE® y se encuentra disponible en el campus de autogestión.`
    : useListaPorTipo
    ? `Los siguientes recursos ya están disponibles en tu perfil en INEE® y se encuentran en el<br><br>Campus de autogestión:`
    : `Las siguientes ${labels.plural} ya están disponibles en tu perfil en INEE® y se encuentran en<br><br>el campus de autogestión:`;

  const listaHtml = useListaPorTipo
    ? renderListaPorTipo(itemsByType!)
    : `<ul style="list-style: none; padding-left: 0;">${renderListaItems(resourceTitles)}</ul>`;

  const textoAcceso = useListaPorTipo
    ? 'Accedé desde acá:'
    : 'Podés acceder desde acá:';

  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
        <p>Hola ${userName},</p>
        
        <p>${textoIntro}</p>
        
        ${isSingle ? '' : listaHtml}
        
        <p style="margin-top: 20px;">${textoAcceso} <a href="https://estudiante.ineeoficial.com/" style="color: #1a73e8; text-decoration: none;">https://estudiante.ineeoficial.com/</a></p>
        
        <p style="margin-top: 28px; margin-bottom: 4px;"><strong>Equipo INEE®</strong></p>
        
        <div style="margin-top: 30px;">
          <img src="https://firebasestorage.googleapis.com/v0/b/inee-admin.firebasestorage.app/o/Imagenes%2Flogo.png?alt=media&token=e46d276c-06d9-4b52-9d7e-33d85845cbb4" alt="INEE Logo" style="max-width: 150px;" />
        </div>
      </div>
  `;

  const { error } = await resend.emails.send({
    from: 'INEE Oficial <contacto@ineeoficial.com>',
    to: userEmail,
    subject,
    html,
  });

  if (error) {
    console.error('Error al enviar email de recurso disponible:', error);
  }
};
