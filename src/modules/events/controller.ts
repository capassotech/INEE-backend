import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { Request, Response } from "express";
import { Event, ValidatedCreateEvent, ValidatedUpdateEvent } from "../../types/events";
import { firestore } from "../../config/firebase";
import { validateUser, normalizeText } from "../../utils/utils";
import { cache, CACHE_KEYS } from "../../utils/cache";

const collection = firestore.collection('events');


export const getAllEvents = async (req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string || '20'), 100); // Máximo 100
        const lastId = req.query.lastId as string | undefined;
        const search = req.query.search as string | undefined; // Búsqueda de texto
        
        // ✅ CACHÉ: Solo cachear si no hay búsqueda ni paginación
        const shouldCache = !search && !lastId;
        
        if (shouldCache) {
            const cacheKey = cache.generateKey(CACHE_KEYS.EVENTS, { limit });
            const cached = cache.get(cacheKey);
            if (cached) {
                return res.json(cached);
            }
        }
        
        // Para búsquedas, necesitamos un límite mayor para tener más resultados después del filtrado
        const queryLimit = search && search.trim() ? limit * 3 : limit; // 3x para búsquedas
        
        // Consultar limit + 1 para saber si hay más documentos
        const extendedQuery = lastId 
            ? collection.orderBy('__name__').startAfter(await collection.doc(lastId).get()).limit(queryLimit + 1)
            : collection.orderBy('__name__').limit(queryLimit + 1);
        
        const snapshot = await extendedQuery.get();

        if (snapshot.empty) {
            return res.json({
                events: [],
                pagination: {
                    hasMore: false,
                    lastId: null,
                    limit,
                    count: 0
                }
            });
        }

        // Tomar solo los primeros 'queryLimit' documentos
        const docs = snapshot.docs.slice(0, queryLimit);
        let events = docs.map((doc) => ({ 
            id: doc.id, 
            ...doc.data() 
        }));
        
        // ✅ BÚSQUEDA DE TEXTO: Filtrar en memoria sobre resultados paginados
        if (search && search.trim()) {
            const searchNormalized = normalizeText(search);
            events = events.filter((event: any) => {
                const title = normalizeText(event.title || '');
                const description = normalizeText(event.description || '');
                return title.includes(searchNormalized) || description.includes(searchNormalized);
            });
            // Limitar después del filtrado
            events = events.slice(0, limit);
        }
        
        const lastDoc = docs[docs.length - 1];
        // Si hay más documentos que el límite, entonces hay más páginas
        const hasMore = snapshot.docs.length > queryLimit;
        
        const response = {
            events,
            pagination: {
                hasMore,
                lastId: lastDoc?.id,
                limit,
                count: events.length
            }
        };
        
        // ✅ CACHÉ: Guardar en caché si corresponde
        if (shouldCache) {
            const cacheKey = cache.generateKey(CACHE_KEYS.EVENTS, { limit });
            cache.set(cacheKey, response, 300); // 5 minutos
        }
        
        return res.json(response);
    } catch (error) {
        console.error('getAllEvents error:', error);
        return res.status(500).json({ error: 'Error al obtener eventos' });
    }
};

export const getEventById = async (req: Request, res: Response) => {
    try {
        const eventId = req.params.id;
        const event = await collection.doc(eventId).get();
        if (!event.exists) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }
        return res.json({ id: event.id, ...event.data() });
    } catch (error) {
        console.error('getEventById error:', error);
        return res.status(500).json({ error: 'Error al obtener evento' });
    }
};


export const createEvent = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({ error: "No autorizado. Se requieren permisos de administrador." });
  }

  try {

    const eventData: ValidatedCreateEvent = req.body;

    const newEvent: any = {
      ...eventData,
    };

    // MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
    // Solo normaliza membresiaId como en updateEvent
    // if (newEvent.membresiaId !== undefined) {
    //   newEvent.membresiaId = newEvent.membresiaId || null;
    // }

    const docRef = await collection.add(newEvent);
    const createdDoc = await docRef.get();

    // ✅ CACHÉ: Invalidar caché de eventos al crear uno nuevo
    cache.invalidatePattern(`${CACHE_KEYS.EVENTS}:`);

    return res.status(201).json({
      id: createdDoc.id,
      ...createdDoc.data(),
      message: "Evento creado exitosamente",
    });
  } catch (err) {
    console.error("createEvent error:", err);
    return res.status(500).json({ error: "Error al crear evento" });
  }
};


export const updateEvent = async (req: AuthenticatedRequest, res: Response) => {
    const isAuthorized = await validateUser(req);
    if (!isAuthorized) {
        return res.status(403).json({
            error: "No autorizado. Se requieren permisos de administrador.",
        });
    }

    try {
        const eventId = req.params.id;
        const updateData: ValidatedUpdateEvent = req.body;

        const eventExists = await collection.doc(eventId).get();
        if (!eventExists.exists) {
            return res.status(404).json({ error: "Evento no encontrado" });
        }

        const dataToUpdate: any = {
            ...updateData,
        };
        // MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
        // if (updateData.membresiaId !== undefined) {
        //     dataToUpdate.membresiaId = updateData.membresiaId || null;
        // }

        await collection.doc(eventId).update(dataToUpdate);
        
        // ✅ CACHÉ: Invalidar caché de eventos al actualizar
        cache.invalidatePattern(`${CACHE_KEYS.EVENTS}:`);
        
        return res.json({
            message: "Evento actualizado exitosamente",
            id: eventId,
        });
    } catch (err) {
        console.error('updateEvent error:', err);
        return res.status(500).json({ error: 'Error al actualizar evento' });
    }
};

export const deleteEvent = async (req: AuthenticatedRequest, res: Response) => {
    if (!validateUser(req)) return res.status(403).json({ error: 'No autorizado' });

    try {
        const eventId = req.params.id;
        await collection.doc(eventId).delete();

        // ✅ CACHÉ: Invalidar caché de eventos al eliminar
        cache.invalidatePattern(`${CACHE_KEYS.EVENTS}:`);

        return res.json({ success: true });
    } catch (err) {
        console.error('deleteEvent error:', err);
        return res.status(500).json({ error: 'Error al eliminar evento' });
    }
};

/**
 * Obtener todas las inscripciones de un evento con datos de los alumnos
 * GET /api/eventos/:eventId/inscripciones
 */
export const getEventInscripciones = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { eventId } = req.params;

        if (!eventId) {
            return res.status(400).json({ error: 'ID de evento requerido' });
        }

        // Verificar que el evento existe
        const eventDoc = await collection.doc(eventId).get();
        if (!eventDoc.exists) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        // Obtener todas las inscripciones activas del evento
        const inscripcionesSnapshot = await firestore
            .collection('inscripciones_eventos')
            .where('eventoId', '==', eventId)
            .where('estado', '==', 'activa')
            .get();

        if (inscripcionesSnapshot.empty) {
            return res.json({
                eventoId: eventId,
                totalInscripciones: 0,
                inscripciones: [],
            });
        }

        // Obtener datos de usuarios para cada inscripción
        const inscripcionesConUsuarios = await Promise.all(
            inscripcionesSnapshot.docs.map(async (inscripcionDoc) => {
                try {
                    const inscripcionData = inscripcionDoc.data();
                    const userId = inscripcionData?.userId;

                    if (!userId) {
                        console.warn(`Inscripción ${inscripcionDoc.id} no tiene userId`);
                        return {
                            inscripcionId: inscripcionDoc.id,
                            fechaInscripcion: null,
                            metodoPago: inscripcionData?.metodoPago || null,
                            precioPagado: inscripcionData?.precioPagado || 0,
                            paymentStatus: inscripcionData?.paymentStatus || null,
                            usuario: {
                                uid: null,
                                nombre: 'Usuario no especificado',
                                apellido: '',
                                email: '',
                                dni: '',
                            },
                        };
                    }

                    // Obtener datos del usuario
                    const userDoc = await firestore.collection('users').doc(userId).get();
                    const userData = userDoc.exists ? userDoc.data() : null;

                    // Convertir fecha de inscripción
                    let fechaInscripcion: Date | string | null = null;
                    if (inscripcionData.fechaInscripcion) {
                        if (inscripcionData.fechaInscripcion.toDate) {
                            fechaInscripcion = inscripcionData.fechaInscripcion.toDate();
                        } else if (inscripcionData.fechaInscripcion instanceof Date) {
                            fechaInscripcion = inscripcionData.fechaInscripcion;
                        } else if (typeof inscripcionData.fechaInscripcion === 'string') {
                            fechaInscripcion = inscripcionData.fechaInscripcion;
                        } else {
                            fechaInscripcion = inscripcionData.fechaInscripcion;
                        }
                    }

                    return {
                        inscripcionId: inscripcionDoc.id,
                        fechaInscripcion: fechaInscripcion instanceof Date 
                            ? fechaInscripcion.toISOString() 
                            : fechaInscripcion,
                        metodoPago: inscripcionData.metodoPago || null,
                        precioPagado: inscripcionData.precioPagado || 0,
                        paymentStatus: inscripcionData.paymentStatus || null,
                        usuario: userData ? {
                            uid: userId,
                            nombre: userData.nombre || '',
                            apellido: userData.apellido || '',
                            email: userData.email || '',
                            dni: userData.dni || '',
                        } : {
                            uid: userId,
                            nombre: 'Usuario no encontrado',
                            apellido: '',
                            email: '',
                            dni: '',
                        },
                    };
                } catch (error) {
                    console.error(`Error procesando inscripción ${inscripcionDoc.id}:`, error);
                    return {
                        inscripcionId: inscripcionDoc.id,
                        fechaInscripcion: null,
                        metodoPago: null,
                        precioPagado: 0,
                        paymentStatus: null,
                        usuario: {
                            uid: null,
                            nombre: 'Error al cargar datos',
                            apellido: '',
                            email: '',
                            dni: '',
                        },
                    };
                }
            })
        );

        return res.json({
            eventoId: eventId,
            totalInscripciones: inscripcionesConUsuarios.length,
            inscripciones: inscripcionesConUsuarios,
        });
    } catch (error: any) {
        console.error('Error al obtener inscripciones del evento:', error);
        console.error('Stack trace:', error?.stack);
        return res.status(500).json({ 
            error: 'Error interno del servidor al obtener inscripciones',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const getUserEvents = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string || '10'), 100); // Máximo 100, default 10
        const lastId = req.query.lastId as string | undefined;
        const search = req.query.search as string | undefined; // Búsqueda de texto
        // Para búsquedas, necesitamos un límite mayor para tener más resultados después del filtrado
        const queryLimit = search && search.trim() ? limit * 3 : limit; // 3x para búsquedas
        const doc = await firestore.collection('users').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        const eventIds = doc.data()?.eventos_asignados || [];
        if (eventIds.length === 0) {
            return res.json({
                events: [],
                pagination: {
                    hasMore: false,
                    lastId: null,
                    limit,
                    count: 0
                }
            });
        }
        // Eliminar IDs duplicados antes de procesar
        const uniqueEventIds = [...new Set(eventIds)];
        // Si hay lastId, encontrar su índice y empezar desde ahí
        let startIndex = 0;
        if (lastId) {
            const lastIndex = uniqueEventIds.indexOf(lastId);
            if (lastIndex !== -1) {
                startIndex = lastIndex + 1;
            }
        }
        // Obtener los IDs para la página actual (usar queryLimit si hay búsqueda)
        const pageEventIds = uniqueEventIds.slice(startIndex, startIndex + queryLimit + 1);
        const hasMore = pageEventIds.length > queryLimit;
        const currentPageIds = hasMore ? pageEventIds.slice(0, queryLimit) : pageEventIds;
        if (currentPageIds.length === 0) {
            return res.json({
                events: [],
                pagination: {
                    hasMore: false,
                    lastId: null,
                    limit,
                    count: 0
                }
            });
        }
        // :marca_de_verificación_blanca: OPTIMIZACIÓN: Batch read con getAll() para evitar N+1 queries
        // Firestore Admin SDK permite leer múltiples documentos en una sola operación
        const BATCH_SIZE = 10; // Firestore getAll() tiene límite de 10 documentos
        const batches = [];
        for (let i = 0; i < currentPageIds.length; i += BATCH_SIZE) {
            const batch = currentPageIds.slice(i, i + BATCH_SIZE);
            const refs = batch.map((eventId) => collection.doc(eventId as string));
            batches.push(firestore.getAll(...refs));
        }
        const allDocs = await Promise.all(batches);
        const eventsData = allDocs
            .flat()
            .filter(doc => doc.exists) // Filtrar documentos que no existen
            .map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
        // Eliminar duplicados por ID (por si acaso)
        let uniqueEvents = eventsData.filter((event, index, self) =>
            index === self.findIndex((e) => e.id === event.id)
        );
        // :marca_de_verificación_blanca: BÚSQUEDA DE TEXTO: Filtrar en memoria sobre resultados paginados
        if (search && search.trim()) {
            const searchLower = search.toLowerCase().trim();
            uniqueEvents = uniqueEvents.filter((event: any) => {
                const title = (event.title || event.titulo || '').toLowerCase();
                const description = (event.description || event.descripcion || '').toLowerCase();
                return title.includes(searchLower) || description.includes(searchLower);
            });
            // Limitar después del filtrado
            uniqueEvents = uniqueEvents.slice(0, limit);
        }
        // Calcular lastId basado en los eventos filtrados
        const lastEventId = uniqueEvents.length > 0
            ? uniqueEvents[uniqueEvents.length - 1].id
            : (currentPageIds[currentPageIds.length - 1] || null);
        // Ajustar hasMore: si hay búsqueda, verificar si hay más resultados después del filtrado
        let finalHasMore = hasMore;
        if (search && search.trim()) {
            // Si hay búsqueda, hasMore se determina si obtuvimos queryLimit resultados
            finalHasMore = pageEventIds.length > queryLimit;
        }
        const responseData = {
            events: uniqueEvents,
            pagination: {
                hasMore: finalHasMore,
                lastId: lastEventId || null,
                limit,
                count: uniqueEvents.length
            }
        };
        return res.json(responseData);
    } catch (err) {
        console.error("getUserEvents error:", err);
        return res.status(500).json({ error: "Error al obtener eventos del usuario" });
    }
};