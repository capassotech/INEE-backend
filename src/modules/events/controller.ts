import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { Request, Response } from "express";
import { Event, ValidatedCreateEvent, ValidatedUpdateEvent } from "../../types/events";
import { firestore } from "../../config/firebase";
import { validateUser } from "../../utils/utils";
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
            const searchLower = search.toLowerCase().trim();
            events = events.filter((event: any) => {
                const title = (event.title || '').toLowerCase();
                const description = (event.description || '').toLowerCase();
                return title.includes(searchLower) || description.includes(searchLower);
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

    // Solo normaliza membresiaId como en updateEvent
    if (newEvent.membresiaId !== undefined) {
      newEvent.membresiaId = newEvent.membresiaId || null;
    }

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
        if (updateData.membresiaId !== undefined) {
            dataToUpdate.membresiaId = updateData.membresiaId || null;
        }

        await collection.doc(eventId).update(dataToUpdate);
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
