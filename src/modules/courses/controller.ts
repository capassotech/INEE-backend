import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { ValidatedCourse, ValidatedUpdateCourse } from "../../types/courses";
import { validateUser, normalizeText } from "../../utils/utils";
import { cache, CACHE_KEYS } from "../../utils/cache";

const collection = firestore.collection("courses");

export const getAllCourses = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '20'), 100); // Máximo 100
    const lastId = req.query.lastId as string | undefined;
    
    // Filtros opcionales
    const pilar = req.query.pilar as string | undefined;
    const type = req.query.type as string | undefined;
    const nivel = req.query.nivel as string | undefined;
    const search = req.query.search as string | undefined; // Búsqueda de texto
    
    // ✅ CACHÉ: Solo cachear si no hay búsqueda ni paginación (consultas más comunes)
    // Las búsquedas y paginación son más dinámicas y no se cachean
    const shouldCache = !search && !lastId;
    
    if (shouldCache) {
      const cacheKey = cache.generateKey(CACHE_KEYS.COURSES, {
        limit,
        pilar: pilar || 'all',
        type: type || 'all',
        nivel: nivel || 'all',
      });
      
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }
    }
    
    // Construir query base
    // Nota: Firestore requiere índices compuestos cuando se usan where() con orderBy()
    // Los índices están definidos en firestore.indexes.json para:
    // - pilar + __name__
    // - type + __name__
    // - nivel + __name__
    let query = collection.orderBy('__name__');
    
    // Aplicar filtros con where() - priorizar pilar, luego type, luego nivel
    // Solo aplicamos un filtro en Firestore para usar los índices compuestos
    // Los filtros adicionales se aplican en memoria después
    if (pilar && pilar !== 'all') {
      query = query.where('pilar', '==', pilar);
    } else if (type && type !== 'all') {
      query = query.where('type', '==', type);
    } else if (nivel && nivel !== 'all') {
      // Normalizar nivel: "inicial" -> "principiante" para compatibilidad
      const normalizedNivel = nivel.toLowerCase() === 'inicial' ? 'principiante' : nivel.toLowerCase();
      query = query.where('nivel', '==', normalizedNivel);
    }
    
    // Aplicar paginación
    if (lastId) {
      const lastDoc = await collection.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    // Consultar limit + 1 para saber si hay más documentos
    const extendedQuery = query.limit(limit + 1);
    const snapshot = await extendedQuery.get();

    if (snapshot.empty) {
      return res.json({
        courses: [],
        pagination: {
          hasMore: false,
          lastId: null,
          limit,
          count: 0
        }
      });
    }

    // Tomar solo los primeros 'limit' documentos
    const docs = snapshot.docs.slice(0, limit);
    let courses = docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // Aplicar filtros adicionales en memoria (ya que Firestore tiene limitaciones con múltiples where())
    // Aplicar todos los filtros que no se aplicaron en la query de Firestore
    
    // Filtro por pilar si no se aplicó en la query
    if (pilar && pilar !== 'all') {
      courses = courses.filter((course: any) => course.pilar === pilar);
    }
    
    // Filtro por type si no se aplicó en la query
    if (type && type !== 'all') {
      courses = courses.filter((course: any) => course.type === type);
    }
    
    // Filtro por nivel si no se aplicó en la query
    if (nivel && nivel !== 'all') {
      const normalizedNivel = nivel.toLowerCase() === 'inicial' ? 'principiante' : nivel.toLowerCase();
      courses = courses.filter((course: any) => {
        const courseNivel = (course.nivel || '').toLowerCase();
        return courseNivel === normalizedNivel;
      });
    }
    
    // Filtro por duración en memoria (duración ahora en semanas)
    const duracion = req.query.duracion as string | undefined;
    if (duracion && duracion !== 'all') {
      courses = courses.filter((course: any) => {
        const courseDuration = course.duracion || 0;
        const num = typeof courseDuration === "string" ? parseInt(courseDuration, 10) : courseDuration;
        
        if (duracion === "Menos de 1 mes") return num > 0 && num <= 4;    // <= 4 semanas
        if (duracion === "1-3 meses") return num > 4 && num <= 12;         // 4-12 semanas
        if (duracion === "3-6 meses") return num > 12 && num <= 26;        // 12-26 semanas
        if (duracion === "6-12 meses") return num > 26 && num <= 52;       // 26-52 semanas
        if (duracion === "+1 año") return num > 52;                        // > 52 semanas
        return true;
      });
    }
    
    // ✅ BÚSQUEDA DE TEXTO: Filtrar en memoria sobre resultados paginados (normalizado sin tildes)
    // Esto es mucho más eficiente que cargar todos los documentos en el frontend
    if (search && search.trim()) {
      const normalizedSearch = normalizeText(search);
      courses = courses.filter((course: any) => {
        const titulo = normalizeText(course.titulo || '');
        const descripcion = normalizeText(course.descripcion || '');
        return titulo.includes(normalizedSearch) || descripcion.includes(normalizedSearch);
      });
    }
    
    const lastDoc = docs[docs.length - 1];
    // Si hay más documentos que el límite, entonces hay más páginas
    const hasMore = snapshot.docs.length > limit;

    const response = {
      courses,
      pagination: {
        hasMore,
        lastId: lastDoc?.id,
        limit,
        count: courses.length
      }
    };

    console.log(response)
    
    // ✅ CACHÉ: Guardar en caché si corresponde
    if (shouldCache) {
      const cacheKey = cache.generateKey(CACHE_KEYS.COURSES, {
        limit,
        pilar: pilar || 'all',
        type: type || 'all',
        nivel: nivel || 'all',
      });
      cache.set(cacheKey, response, 300); // 5 minutos
    }

    return res.json(response);
  } catch (err) {
    console.error("getAllCourses error:", err);
    return res.status(500).json({ error: "Error al obtener cursos" });
  }
};

export const getUserCourses = async (req: Request, res: Response) => {
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

    const courseIds = doc.data()?.cursos_asignados || [];
    
    if (courseIds.length === 0) {
      return res.json({
        courses: [],
        pagination: {
          hasMore: false,
          lastId: null,
          limit,
          count: 0
        }
      });
    }
    
    // Eliminar IDs duplicados antes de procesar
    const uniqueCourseIds = [...new Set(courseIds)];
    
    // Si hay lastId, encontrar su índice y empezar desde ahí
    let startIndex = 0;
    if (lastId) {
      const lastIndex = uniqueCourseIds.indexOf(lastId);
      if (lastIndex !== -1) {
        startIndex = lastIndex + 1;
      }
    }
    
    // Obtener los IDs para la página actual (usar queryLimit si hay búsqueda)
    const pageCourseIds = uniqueCourseIds.slice(startIndex, startIndex + queryLimit + 1);
    const hasMore = pageCourseIds.length > queryLimit;
    const currentPageIds = hasMore ? pageCourseIds.slice(0, queryLimit) : pageCourseIds;
    
    
    if (currentPageIds.length === 0) {
      return res.json({
        courses: [],
        pagination: {
          hasMore: false,
          lastId: null,
          limit,
          count: 0
        }
      });
    }
    
    // ✅ OPTIMIZACIÓN: Batch read con getAll() para evitar N+1 queries
    // Firestore Admin SDK permite leer múltiples documentos en una sola operación
    const BATCH_SIZE = 10; // Firestore getAll() tiene límite de 10 documentos
    const batches = [];
    
    for (let i = 0; i < currentPageIds.length; i += BATCH_SIZE) {
      const batch = currentPageIds.slice(i, i + BATCH_SIZE);
      const refs = batch.map((courseId) => collection.doc(courseId as string));
      batches.push(firestore.getAll(...refs));
    }
    
    const allDocs = await Promise.all(batches);
    const coursesData = allDocs
      .flat()
      .filter(doc => doc.exists) // Filtrar documentos que no existen
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    
    // Eliminar duplicados por ID (por si acaso)
    let uniqueCourses = coursesData.filter((course, index, self) =>
      index === self.findIndex((c) => c.id === course.id)
    );

    // ✅ BÚSQUEDA DE TEXTO: Filtrar en memoria sobre resultados paginados (normalizado sin tildes)
    if (search && search.trim()) {
      const normalizedSearch = normalizeText(search);
      uniqueCourses = uniqueCourses.filter((course: any) => {
        const titulo = normalizeText(course.titulo || '');
        const descripcion = normalizeText(course.descripcion || '');
        return titulo.includes(normalizedSearch) || descripcion.includes(normalizedSearch);
      });
      // Limitar después del filtrado
      uniqueCourses = uniqueCourses.slice(0, limit);
    }

    // Calcular lastId basado en los cursos filtrados
    const lastCourseId = uniqueCourses.length > 0 
      ? uniqueCourses[uniqueCourses.length - 1].id 
      : (currentPageIds[currentPageIds.length - 1] || null);
    
    // Ajustar hasMore: si hay búsqueda, verificar si hay más resultados después del filtrado
    let finalHasMore = hasMore;
    if (search && search.trim()) {
      // Si hay búsqueda, hasMore se determina si obtuvimos queryLimit resultados
      finalHasMore = pageCourseIds.length > queryLimit;
    }

    const responseData = {
      courses: uniqueCourses,
      pagination: {
        hasMore: finalHasMore,
        lastId: lastCourseId || null,
        limit,
        count: uniqueCourses.length
      }
    };


    return res.json(responseData);
  } catch (err) {
    console.error("getUserCourses error:", err);
    return res.status(500).json({ error: "Error al obtener cursos del usuario" });
  }
};

export const getCourseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await collection.doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("getCourseById error:", err);
    return res.status(500).json({ error: "Error al obtener curso" });
  }
};

export const createCourse = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const courseData: ValidatedCourse = req.body;

    // Verificar que todos los profesores existen
    for (const profesorId of courseData.id_profesor) {
      const profesorExists = await firestore
        .collection("profesores")
        .doc(profesorId)
        .get();
      if (!profesorExists.exists) {
        return res
          .status(404)
          .json({ error: `El profesor con ID "${profesorId}" no existe` });
      }
    }

    // Verificar que todos los módulos existen (solo si hay módulos)
    if (courseData.id_modulos.length > 0) {
      for (const moduloId of courseData.id_modulos) {
        const moduloExists = await firestore
          .collection("modulos")
          .doc(moduloId)
          .get();
        if (!moduloExists.exists) {
          return res.status(404).json({
            error: `El módulo con ID "${moduloId}" no existe`,
          });
        }
      }
    }

    const docRef = await collection.add({ ...courseData });

    // ✅ CACHÉ: Invalidar caché de cursos al crear uno nuevo
    cache.invalidatePattern(`${CACHE_KEYS.COURSES}:`);

    return res.status(201).json({
      id: docRef.id,
      message: "Curso creado exitosamente",
      ...courseData,
    });
  } catch (err) {
    console.error("createCourse error:", err);
    return res.status(500).json({ error: "Error al crear curso" });
  }
};

export const updateCourse = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const { id } = req.params;
    const updateData: ValidatedUpdateCourse = req.body;
    

    const courseExists = await collection.doc(id).get();
    if (!courseExists.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    if (updateData.id_profesor) {
      // Verificar que todos los profesores existen
      for (const profesorId of updateData.id_profesor) {
        const profesorExists = await firestore
          .collection("profesores")
          .doc(profesorId)
          .get();
        if (!profesorExists.exists) {
          return res
            .status(404)
            .json({ error: `El profesor con ID "${profesorId}" no existe` });
        }
      }
    }

    if (updateData.id_modulos && updateData.id_modulos.length > 0) {
      for (const moduloId of updateData.id_modulos) {
        const moduloExists = await firestore
          .collection("modulos")
          .doc(moduloId)
          .get();
        if (!moduloExists.exists) {
          return res.status(404).json({
            error: `El módulo con ID "${moduloId}" no existe`,
          });
        }
      }
    }

    await collection.doc(id).update({ ...updateData });

    // ✅ CACHÉ: Invalidar caché de cursos al actualizar
    cache.invalidatePattern(`${CACHE_KEYS.COURSES}:`);

    return res.json({
      message: "Curso actualizado exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("updateCourse error:", err);
    return res.status(500).json({ error: "Error al actualizar curso" });
  }
};

export const deleteCourse = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const { id } = req.params;

    const courseExists = await collection.doc(id).get();
    if (!courseExists.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    await collection.doc(id).delete();

    // ✅ CACHÉ: Invalidar caché de cursos al eliminar
    cache.invalidatePattern(`${CACHE_KEYS.COURSES}:`);

    return res.json({
      message: "Curso eliminado exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("deleteCourse error:", err);
    return res.status(500).json({ error: "Error al eliminar curso" });
  }
};

export const checkCourseExists = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await collection.doc(id).get();
    return res.json({ exists: doc.exists });
  } catch (err) {
    console.error("checkCourseExists error:", err);
    return res.status(500).json({ error: "Error al verificar curso" });
  }
};

