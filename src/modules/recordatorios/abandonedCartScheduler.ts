import cron from 'node-cron';
import { firestore } from '../../config/firebase';
import { sendAbandonedCartEmail, type AbandonedCartItem } from '../emails/abandonedCartEmail';

/*
 * Recordatorio de carrito abandonado.
 *
 * Cada hora revisa los carritos de usuarios con sesión (los anónimos no tienen email) que:
 *   - tienen productos,
 *   - no cambiaron en las últimas ABANDONED_CART_HOURS horas (por defecto 24),
 *   - no son más viejos que ABANDONED_CART_MAX_DAYS días (por defecto 7),
 *   - y no recibieron aviso desde su último cambio.
 * Les envía un único email con lo que dejaron. Si el carrito vuelve a cambiar, puede recibir
 * otro aviso recién después de otro período de inactividad.
 *
 * Variables de entorno:
 *   ABANDONED_CART_REMINDERS_ENABLED=false  → desactiva el envío automático
 *   ABANDONED_CART_HOURS / ABANDONED_CART_MAX_DAYS
 *   CRON_SECRET → protege el endpoint para dispararlo desde un cron externo
 *   FRONTEND_URL / TIENDA_FRONTEND_URL → link al carrito
 */

const HOURS = Number(process.env.ABANDONED_CART_HOURS) || 24;
const MAX_DAYS = Number(process.env.ABANDONED_CART_MAX_DAYS) || 7;

const PRODUCT_SOURCES: Record<string, { collection: string; tipo: string; owned: string[] }> = {
  course: { collection: 'courses', tipo: 'Formación', owned: ['cursos_asignados'] },
  ebook: { collection: 'ebooks', tipo: 'E-book', owned: ['ebooks_asignados', 'ebooksAsignados'] },
  event: { collection: 'events', tipo: 'Evento', owned: ['eventos_asignados', 'eventosAsignados'] },
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') return (value as { toDate: () => Date }).toDate();
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
};

const cartUrl = (): string => {
  const base = (process.env.TIENDA_FRONTEND_URL || process.env.FRONTEND_URL || 'https://ineeoficial.com').replace(/\/$/, '');
  return `${base}/carrito`;
};

export interface AbandonedCartRunResult {
  revisados: number;
  enviados: number;
  omitidos: Record<string, number>;
  dryRun: boolean;
}

let running = false;

export const runAbandonedCartReminders = async ({ dryRun = false } = {}): Promise<AbandonedCartRunResult> => {
  const result: AbandonedCartRunResult = { revisados: 0, enviados: 0, omitidos: {}, dryRun };
  const skip = (reason: string) => (result.omitidos[reason] = (result.omitidos[reason] || 0) + 1);

  if (running) {
    skip('ya_en_ejecucion');
    return result;
  }
  running = true;

  try {
    const now = Date.now();
    const inactiveSince = now - HOURS * 60 * 60 * 1000;
    const oldestAllowed = now - MAX_DAYS * 24 * 60 * 60 * 1000;

    const snapshot = await firestore.collection('carts').get();

    for (const cartDoc of snapshot.docs) {
      const cart = cartDoc.data();
      const items: Array<{ productId?: string; productType?: string; unitPrice?: number }> = Array.isArray(cart.items) ? cart.items : [];
      if (!cart.userId || items.length === 0) continue;
      result.revisados++;

      const lastActivity = toDate(cart.updatedAt) || toDate(cart.createdAt);
      if (!lastActivity) {
        skip('sin_fecha');
        continue;
      }
      const t = lastActivity.getTime();
      if (t > inactiveSince) {
        skip('activo_recientemente');
        continue;
      }
      if (t < oldestAllowed) {
        skip('demasiado_viejo');
        continue;
      }
      const sentAt = toDate(cart.abandonedReminderSentAt);
      if (sentAt && sentAt.getTime() >= t) {
        skip('ya_avisado');
        continue;
      }

      const userDoc = await firestore.collection('users').doc(cart.userId).get();
      const user = userDoc.data();
      if (!user?.email || user.activo === false) {
        skip('usuario_sin_email');
        continue;
      }

      // Productos todavía disponibles y que el usuario no tenga ya
      const pending: AbandonedCartItem[] = [];
      for (const item of items) {
        const source = PRODUCT_SOURCES[item.productType || 'course'] || PRODUCT_SOURCES.course;
        if (!item.productId) continue;
        const owned = source.owned.some((field) => Array.isArray(user[field]) && user[field].includes(item.productId));
        if (owned) continue;
        const productDoc = await firestore.collection(source.collection).doc(item.productId).get();
        const product = productDoc.data();
        if (!product || (product.estado && product.estado !== 'activo')) continue;
        pending.push({
          titulo: product.titulo || product.title || 'Producto',
          imagen: product.imagen || undefined,
          precio: typeof product.precio === 'number' ? product.precio : item.unitPrice,
          tipo: source.tipo,
        });
      }
      if (pending.length === 0) {
        skip('nada_pendiente');
        continue;
      }

      if (dryRun) {
        result.enviados++;
        continue;
      }

      const sent = await sendAbandonedCartEmail({
        userEmail: user.email,
        userName: user.nombre || '',
        items: pending,
        cartUrl: cartUrl(),
      });
      if (sent) {
        await cartDoc.ref.update({ abandonedReminderSentAt: new Date() });
        result.enviados++;
        console.log(`[Carrito abandonado] Aviso enviado | carrito ${cartDoc.id} | ${pending.length} producto(s)`);
      } else {
        skip('error_envio');
      }
    }
  } finally {
    running = false;
  }

  return result;
};

/** Programa la revisión cada hora (minuto 15). Se llama una vez al iniciar el servidor. */
export const startAbandonedCartScheduler = () => {
  if (process.env.ABANDONED_CART_REMINDERS_ENABLED === 'false') {
    console.log('[Carrito abandonado] Recordatorios desactivados (ABANDONED_CART_REMINDERS_ENABLED=false)');
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Carrito abandonado] RESEND_API_KEY no configurada: no se envían recordatorios');
    return;
  }
  cron.schedule('15 * * * *', () => {
    runAbandonedCartReminders()
      .then((r) => {
        if (r.enviados > 0) console.log(`[Carrito abandonado] Revisión: ${r.enviados} aviso(s) enviado(s) de ${r.revisados} carrito(s)`);
      })
      .catch((error) => console.error('[Carrito abandonado] Error en la revisión:', error));
  });
  console.log(`[Carrito abandonado] Revisión programada cada hora (inactividad: ${HOURS} h, antigüedad máxima: ${MAX_DAYS} días)`);
};
