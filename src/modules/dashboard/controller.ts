import { Response } from 'express';
import { firestore } from '../../config/firebase';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { validateUser } from '../../utils/utils';
import { getEventDateTime, mapPilarToProductType, toJsDate } from '../../utils/listQuery';

const isApprovedOrder = (order: Record<string, unknown>): boolean => {
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  const status = String(order.status || '').toLowerCase();
  const paymentDetails = (order.paymentDetails || {}) as Record<string, unknown>;
  const statusDetail = String(paymentDetails.status_detail || '').toLowerCase();

  return (
    paymentStatus === 'approved' ||
    status === 'paid' ||
    status === 'approved' ||
    statusDetail === 'accredited'
  );
};

const getOrderDate = (order: Record<string, unknown>): Date | null => {
  const paymentDetails = (order.paymentDetails || {}) as Record<string, unknown>;
  return (
    toJsDate(paymentDetails.date_approved) ||
    toJsDate(paymentDetails.date_created) ||
    toJsDate(order.createdAt)
  );
};

const getOrderRevenue = (order: Record<string, unknown>): number => {
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length > 0) {
    return items.reduce((sum: number, item: Record<string, unknown>) => {
      const unitPrice = Number(item.unit_price ?? item.price ?? 0);
      const quantity = Number(item.quantity ?? 1);
      return sum + unitPrice * quantity;
    }, 0);
  }

  const paymentDetails = (order.paymentDetails || {}) as Record<string, unknown>;
  return Number(order.totalPrice ?? paymentDetails.transaction_amount ?? 0);
};

const mapCourseToPopularProduct = (course: Record<string, unknown>) => ({
  id: course.id,
  title: course.titulo || course.title || '',
  description: course.descripcion || course.descripcion_corta || course.description || '',
  price: Number(course.precio ?? course.price ?? 0),
  type: mapPilarToProductType(String(course.pilar || '')),
  image: course.imagen || course.image || '',
  duration: course.duracion ? `${course.duracion} horas` : '',
  students: Number(course.estudiantes ?? 0),
  level: course.nivel || '',
  isActive: course.estado === 'activo',
  createdAt: toJsDate(course.createdAt)?.toISOString() || null,
  updatedAt: toJsDate(course.updatedAt)?.toISOString() || null,
});

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({ error: 'No autorizado. Se requieren permisos de administrador.' });
  }

  try {
    const [usersSnapshot, coursesSnapshot, ordersSnapshot, eventsSnapshot] = await Promise.all([
      firestore.collection('users').get(),
      firestore.collection('courses').get(),
      firestore.collection('orders').get(),
      firestore.collection('events').get(),
    ]);

    const users = usersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const students = users.filter((user) => {
      const role = String((user as Record<string, unknown>).role || '').toLowerCase();
      return role === 'alumno' || role === 'estudiante' || role === 'student';
    });

    const totalStudents = students.length;
    const activeStudents = students.filter(
      (user) => (user as Record<string, unknown>).activo !== false
    ).length;

    const courses = coursesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const totalProducts = courses.length;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const orders = ordersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));

    const approvedOrders = orders.filter(isApprovedOrder);
    const monthOrders = approvedOrders.filter((order) => {
      const orderDate = getOrderDate(order);
      return orderDate && orderDate >= startOfMonth && orderDate <= endOfMonth;
    });

    const currentMonthRevenue = monthOrders.reduce(
      (sum, order) => sum + getOrderRevenue(order),
      0
    );
    const totalRevenue = approvedOrders.reduce(
      (sum, order) => sum + getOrderRevenue(order),
      0
    );

    const popularProducts = courses
      .filter((course) => (course as Record<string, unknown>).estado === 'activo')
      .sort(
        (a, b) =>
          Number((b as Record<string, unknown>).estudiantes ?? 0) -
          Number((a as Record<string, unknown>).estudiantes ?? 0)
      )
      .slice(0, 3)
      .map((course) => mapCourseToPopularProduct(course as Record<string, unknown>));

    const recentFormaciones = courses
      .filter((course) => (course as Record<string, unknown>).estado === 'activo')
      .sort((a, b) => {
        const dateA = toJsDate((a as Record<string, unknown>).createdAt)?.getTime() || 0;
        const dateB = toJsDate((b as Record<string, unknown>).createdAt)?.getTime() || 0;
        return dateB - dateA;
      })
      .slice(0, 3)
      .map((course) => {
        const data = course as Record<string, unknown>;
        return {
          id: course.id,
          titulo: data.titulo,
          descripcion: data.descripcion || data.descripcion_corta,
          modalidad: data.modalidad,
          estado: data.estado,
          precio: data.precio,
          precioUSD: data.precioUSD ?? null,
          estudiantes: data.estudiantes ?? 0,
          esDestacado: data.esDestacado ?? false,
          imagen: data.imagen,
          createdAt: toJsDate(data.createdAt)?.toISOString() || data.createdAt || null,
        };
      });

    const upcomingEvents = eventsSnapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
      .filter((event: Record<string, unknown>) => {
        const eventDate = getEventDateTime(event);
        return eventDate && eventDate >= now && event.estado !== 'inactivo';
      })
      .sort((a, b) => {
        const dateA = getEventDateTime(a)?.getTime() || 0;
        const dateB = getEventDateTime(b)?.getTime() || 0;
        return dateA - dateB;
      })
      .slice(0, 2)
      .map((event: Record<string, unknown> & { id: string }) => ({
        id: event.id,
        titulo: event.titulo || event.title,
        descripcion: event.descripcion || event.description,
        tipo: event.tipo || event.modalidad,
        estado: event.estado,
        fecha: event.fecha || event.date,
        hora: event.hora,
        precio: event.precio ?? event.price,
        precioUSD: event.precioUSD ?? null,
        imagen: event.imagen || event.image,
      }));

    return res.json({
      totalStudents,
      activeStudents,
      totalProducts,
      currentMonthRevenue,
      totalRevenue,
      popularProducts,
      recentFormaciones,
      upcomingEvents,
    });
  } catch (error) {
    console.error('getDashboardStats error:', error);
    return res.status(500).json({ error: 'Error al obtener estadísticas del dashboard' });
  }
};
