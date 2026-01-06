import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser, normalizeText } from "../../utils/utils";
import { ValidatedCreateEbook, ValidatedUpdateEbook } from "../../types/ebooks";
import { cache, CACHE_KEYS } from "../../utils/cache";

const collection = firestore.collection("ebooks");

// ✅ Obtener todos los ebooks
export const getAllEbooks = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '20'), 100); // Máximo 100
    const lastId = req.query.lastId as string | undefined;
    const search = req.query.search as string | undefined; // Búsqueda de texto
    
    // ✅ CACHÉ: Solo cachear si no hay búsqueda ni paginación
    const shouldCache = !search && !lastId;
    
    if (shouldCache) {
      const cacheKey = cache.generateKey(CACHE_KEYS.EBOOKS, { limit });
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
        ebooks: [],
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
    let ebooks = docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // ✅ BÚSQUEDA DE TEXTO: Filtrar en memoria sobre resultados paginados (normalizado sin tildes)
    if (search && search.trim()) {
      const normalizedSearch = normalizeText(search);
      ebooks = ebooks.filter((ebook: any) => {
        const title = normalizeText(ebook.title || ebook.titulo || '');
        const description = normalizeText(ebook.description || ebook.descripcion || '');
        const author = normalizeText(ebook.author || ebook.autor || '');
        return title.includes(normalizedSearch) || 
               description.includes(normalizedSearch) || 
               author.includes(normalizedSearch);
      });
      // Limitar después del filtrado
      ebooks = ebooks.slice(0, limit);
    }
    
    const lastDoc = docs[docs.length - 1];
    // Si hay más documentos que el límite, entonces hay más páginas
    const hasMore = snapshot.docs.length > queryLimit;
    
    const response = {
      ebooks,
      pagination: {
        hasMore,
        lastId: lastDoc?.id,
        limit,
        count: ebooks.length
      }
    };
    
    // ✅ CACHÉ: Guardar en caché si corresponde
    if (shouldCache) {
      const cacheKey = cache.generateKey(CACHE_KEYS.EBOOKS, { limit });
      cache.set(cacheKey, response, 300); // 5 minutos
    }
    
    return res.json(response);
  } catch (err) {
    console.error("getAllEbooks error:", err);
    return res.status(500).json({ error: "Error al obtener ebooks" });
  }
};

// ✅ Obtener ebook por ID
export const getEbookById = async (req: Request, res: Response) => {
  try {
    const ebookId = req.params.id;
    const ebook = await collection.doc(ebookId).get();

    if (!ebook.exists) {
      return res.status(404).json({ error: "Ebook no encontrado" });
    }

    return res.json({ id: ebook.id, ...ebook.data() });
  } catch (err) {
    console.error("getEbookById error:", err);
    return res.status(500).json({ error: "Error al obtener ebook" });
  }
};

export const createEbook = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res
      .status(403)
      .json({ error: "No autorizado. Se requieren permisos de administrador." });
  }

  try {
    const ebookData: ValidatedCreateEbook = req.body;
    const newEbook: any = { ...ebookData };

    const docRef = await collection.add(newEbook);
    const createdDoc = await docRef.get();

    // ✅ CACHÉ: Invalidar caché de ebooks al crear uno nuevo
    cache.invalidatePattern(`${CACHE_KEYS.EBOOKS}:`);

    return res.status(201).json({
      id: createdDoc.id,
      ...createdDoc.data(),
      message: "Ebook creado exitosamente",
    });
  } catch (err) {
    console.error("❌ [CREATE EBOOK ERROR]:", err);
    return res.status(500).json({ error: "Error al crear ebook" });
  }
};

export const updateEbook = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res
      .status(403)
      .json({ error: "No autorizado. Se requieren permisos de administrador." });
  }

  try {
    const ebookId = req.params.id;
    const bodyData = req.body;
    
    // Si el frontend envía los datos dentro de un objeto 'ebook', extraerlos
    const datosEbook = bodyData.ebook || bodyData;

    const ebookDoc = await collection.doc(ebookId).get();
    if (!ebookDoc.exists) {
      return res.status(404).json({ error: "Ebook no encontrado" });
    }

    // Preparar datos de actualización
    const dataToUpdate: any = {};

    // Copiar todos los campos válidos
    // Excluir campos que no deben actualizarse directamente
    const camposExcluidos = ['id'];
    
    for (const [key, value] of Object.entries(datosEbook)) {
      // No incluir campos excluidos
      if (camposExcluidos.includes(key)) {
        continue;
      }
      
      // Incluir el campo si tiene un valor válido (incluyendo false y 0)
      if (value !== undefined && value !== null) {
        // No copiar objetos de Firestore directamente (tienen _seconds, _nanoseconds)
        if (typeof value === 'object' && value !== null && ('_seconds' in value || '_nanoseconds' in value)) {
          continue;
        }
        dataToUpdate[key] = value;
      }
    }

    await collection.doc(ebookId).update(dataToUpdate);

    // ✅ CACHÉ: Invalidar caché de ebooks al actualizar
    cache.invalidatePattern(`${CACHE_KEYS.EBOOKS}:`);

    // Obtener documento actualizado
    const updatedDoc = await collection.doc(ebookId).get();
    const updatedData = updatedDoc.data();

    return res.json({
      message: "Ebook actualizado exitosamente",
      id: ebookId,
      ebook: {
        id: updatedDoc.id,
        ...updatedData,
      },
    });
  } catch (err) {
    console.error("❌ [UPDATE EBOOK ERROR]:", err);
    return res.status(500).json({ error: "Error al actualizar ebook" });
  }
};

// ✅ Eliminar ebook
export const deleteEbook = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const ebookId = req.params.id;
    await collection.doc(ebookId).delete();

    // ✅ CACHÉ: Invalidar caché de ebooks al eliminar
    cache.invalidatePattern(`${CACHE_KEYS.EBOOKS}:`);

    return res.json({ message: "Ebook eliminado exitosamente" });
  } catch (err) {
    return res.status(500).json({ error: "Error al eliminar ebook" });
  }
};
