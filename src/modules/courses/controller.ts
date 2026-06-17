import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { ValidatedCourse, ValidatedUpdateCourse } from "../../types/courses";
import { validateUser, normalizeText } from "../../utils/utils";
import { cache, CACHE_KEYS } from "../../utils/cache";
import {
  matchesCourseModalidad,
  matchesSearch,
  paginateByCursor,
  parseLimit,
  parseSortOrder,
  sortByComparator,
  toJsDate,
} from "../../utils/listQuery";

const collection = firestore.collection("courses");

const mapCourseResponse = (id: string, data: FirebaseFirestore.DocumentData | undefined) => ({
  id,
  ...(data || {}),
  precioUSD: data?.precioUSD ?? null,
});

export const getAllCourses = async (req: Request, res: Response) => {
  try {
    const limit = parseLimit(req.query.limit as string);
    const lastId = req.query.lastId as string | undefined;
    const pilar = req.query.pilar as string | undefined;
    const type = req.query.type as string | undefined;
    const nivel = req.query.nivel as string | undefined;
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const modalidad = req.query.modalidad as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    const esDestacado = req.query.esDestacado as string | undefined;
    const duracion = req.query.duracion as string | undefined;

    const sortOrder = parseSortOrder(
      req.query.sortOrder as string | undefined,
      sortBy === 'title' || sortBy === 'price' || sortBy === 'students' ? (sortBy === 'title' ? 'asc' : 'desc') : 'desc'
    );

    const hasAdvancedFilters = Boolean(
      search?.trim() ||
      status ||
      modalidad ||
      esDestacado !== undefined ||
      sortBy ||
      (pilar && pilar !== 'all') ||
      (type && type !== 'all') ||
      (nivel && nivel !== 'all') ||
      (duracion && duracion !== 'all')
    );

    let query: FirebaseFirestore.Query = collection.orderBy('__name__');

    if (status) {
      query = query.where('estado', '==', status);
    } else if (modalidad) {
      const dbModalidad = modalidad.toUpperCase() === 'ON_DEMAND' ? 'on-demand' : modalidad.toLowerCase();
      query = query.where('modalidad', '==', dbModalidad);
    } else if (esDestacado === 'true') {
      query = query.where('esDestacado', '==', true);
    } else if (esDestacado === 'false') {
      query = query.where('esDestacado', '==', false);
    } else if (pilar && pilar !== 'all') {
      query = query.where('pilar', '==', pilar);
    } else if (type && type !== 'all') {
      query = query.where('type', '==', type);
    } else if (nivel && nivel !== 'all') {
      const normalizedNivel = nivel.toLowerCase() === 'inicial' ? 'principiante' : nivel.toLowerCase();
      query = query.where('nivel', '==', normalizedNivel);
    }

    let courses: Array<Record<string, unknown> & { id: string }> = hasAdvancedFilters
      ? (await query.limit(1000).get()).docs.map((doc) =>
          mapCourseResponse(doc.id, doc.data()) as Record<string, unknown> & { id: string }
        )
      : (await (lastId
          ? query.startAfter(await collection.doc(lastId).get()).limit(limit + 1)
          : query.limit(limit + 1)
        ).get()).docs.map((doc) =>
          mapCourseResponse(doc.id, doc.data()) as Record<string, unknown> & { id: string }
        );

    if (status) {
      courses = courses.filter((course: Record<string, unknown>) => course.estado === status);
    }
    if (modalidad) {
      courses = courses.filter((course: Record<string, unknown>) =>
        matchesCourseModalidad(course, modalidad)
      );
    }
    if (esDestacado === 'true') {
      courses = courses.filter((course: Record<string, unknown>) => course.esDestacado === true);
    } else if (esDestacado === 'false') {
      courses = courses.filter((course: Record<string, unknown>) => course.esDestacado !== true);
    }
    if (pilar && pilar !== 'all') {
      courses = courses.filter((course: Record<string, unknown>) => course.pilar === pilar);
    }
    if (type && type !== 'all') {
      courses = courses.filter((course: Record<string, unknown>) => course.type === type);
    }
    if (nivel && nivel !== 'all') {
      const normalizedNivel = nivel.toLowerCase() === 'inicial' ? 'principiante' : nivel.toLowerCase();
      courses = courses.filter((course: Record<string, unknown>) =>
        String(course.nivel || '').toLowerCase() === normalizedNivel
      );
    }
    if (duracion && duracion !== 'all') {
      courses = courses.filter((course: Record<string, unknown>) => {
        const courseDuration = course.duracion || 0;
        const num = typeof courseDuration === 'string' ? parseInt(courseDuration, 10) : Number(courseDuration);
        if (duracion === 'Menos de 1 mes') return num > 0 && num <= 4;
        if (duracion === '1-3 meses') return num > 4 && num <= 12;
        if (duracion === '3-6 meses') return num > 12 && num <= 26;
        if (duracion === '6-12 meses') return num > 26 && num <= 52;
        if (duracion === '+1 año') return num > 52;
        return true;
      });
    }

    courses = courses.filter((course: Record<string, unknown>) =>
      matchesSearch(search, [
        String(course.titulo || ''),
        String(course.descripcion || course.sobre_curso || ''),
        String(course.descripcion_corta || ''),
      ])
    );

    courses = sortByComparator(
      courses,
      sortBy,
      sortOrder,
      {
        title: (a, b) => String(a.titulo || '').localeCompare(String(b.titulo || '')),
        price: (a, b) => Number(a.precio ?? 0) - Number(b.precio ?? 0),
        students: (a, b) => Number(a.estudiantes ?? 0) - Number(b.estudiantes ?? 0),
        date: (a, b) =>
          (toJsDate(a.createdAt)?.getTime() || 0) - (toJsDate(b.createdAt)?.getTime() || 0),
      },
      (a, b) => String(a.id).localeCompare(String(b.id))
    );

    if (hasAdvancedFilters) {
      const paginated = paginateByCursor(courses, limit, lastId);
      return res.json({
        courses: paginated.items,
        pagination: {
          hasMore: paginated.hasMore,
          lastId: paginated.lastId,
          limit,
          count: paginated.items.length,
        },
      });
    }

    const hasMore = courses.length > limit;
    const pageCourses = courses.slice(0, limit);
    return res.json({
      courses: pageCourses,
      pagination: {
        hasMore,
        lastId: pageCourses[pageCourses.length - 1]?.id ?? null,
        limit,
        count: pageCourses.length,
      },
    });
  } catch (err) {
    console.error("getAllCourses error:", err);
    return res.status(500).json({ error: "Error al obtener formaciones" });
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
      .map(doc => {
        const data = doc.data();
        if (!data) {
          return { id: doc.id };
        }
        return mapCourseResponse(doc.id, data);
      });
    
    // Eliminar duplicados por ID (por si acaso)
    let uniqueCourses = coursesData.filter((course, index, self) =>
      index === self.findIndex((c) => c?.id === course?.id)
    );

    // ✅ BÚSQUEDA DE TEXTO: Filtrar en memoria sobre resultados paginados
    if (search && search.trim()) {
      const searchNormalized = normalizeText(search);
      uniqueCourses = uniqueCourses.filter((course: any) => {
        const titulo = normalizeText(course.titulo || '');
        const descripcion = normalizeText(course.descripcion || course.sobre_curso || '');
        const descripcionCorta = normalizeText(course.descripcion_corta || '');
        return titulo.includes(searchNormalized) || descripcion.includes(searchNormalized) || descripcionCorta.includes(searchNormalized);
      });
      // Limitar después del filtrado
      uniqueCourses = uniqueCourses.slice(0, limit);
    }

    // Calcular lastId basado en las formaciones filtradas
    const lastCourseId = uniqueCourses.length > 0 
      ? uniqueCourses[uniqueCourses.length - 1]?.id 
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
    return res.status(500).json({ error: "Error al obtener formaciones del usuario" });
  }
};

export const getCourseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await collection.doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Formacion no encontrada" });
    }

    const data = doc.data();

    return res.json(mapCourseResponse(doc.id, data));
  } catch (err) {
    console.error("getCourseById error:", err);
    return res.status(500).json({ error: "Error al obtener formacion" });
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

    // Normalizar id_profesor a array para facilitar la validación
    const profesorIds = Array.isArray(courseData.id_profesor) 
      ? courseData.id_profesor 
      : [courseData.id_profesor];

    // Verificar que todos los profesores existen
    for (const profesorId of profesorIds) {
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

    // Verificar que todos los avales existen (solo si hay avales)
    if (courseData.id_avales && courseData.id_avales.length > 0) {
      for (const avalId of courseData.id_avales) {
        const avalExists = await firestore
          .collection("avales")
          .doc(avalId)
          .get();
        if (!avalExists.exists) {
          return res.status(404).json({
            error: `El aval con ID "${avalId}" no existe`,
          });
        }
      }
    }

    const newCourse = {
      ...courseData,
      precioUSD: courseData.precioUSD ?? null,
    };
    const docRef = await collection.add(newCourse);

    // ✅ CACHÉ: Invalidar caché de formaciones al crear uno nuevo
    cache.invalidatePattern(`${CACHE_KEYS.COURSES}:`);

    return res.status(201).json({
      id: docRef.id,
      message: "Formacion creada exitosamente",
      ...newCourse,
    });
  } catch (err) {
    console.error("createCourse error:", err);
    return res.status(500).json({ error: "Error al crear formacion" });
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
    
    const existingCourse = await collection.doc(id).get();
    if (!existingCourse.exists) {
      return res.status(404).json({ error: "Formacion no encontrada" });
    }

    if (updateData.id_profesor) {
      // Normalizar id_profesor a array para facilitar la validación
      const profesorIds = Array.isArray(updateData.id_profesor) 
        ? updateData.id_profesor 
        : [updateData.id_profesor];

      // Verificar que todos los profesores existen
      for (const profesorId of profesorIds) {
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

    // Verificar que todos los avales existen (solo si se están actualizando avales)
    if (updateData.id_avales && updateData.id_avales.length > 0) {
      for (const avalId of updateData.id_avales) {
        const avalExists = await firestore
          .collection("avales")
          .doc(avalId)
          .get();
        if (!avalExists.exists) {
          return res.status(404).json({
            error: `El aval con ID "${avalId}" no existe`,
          });
        }
      }
    }

    await collection.doc(id).update({ ...updateData });

    // ✅ CACHÉ: Invalidar caché de formaciones al actualizar
    cache.invalidatePattern(`${CACHE_KEYS.COURSES}:`);

    // Obtener la formacion actualizado para devolverlo con los saltos de línea preservados
    const updatedDoc = await collection.doc(id).get();
    const updatedData = updatedDoc.exists ? mapCourseResponse(updatedDoc.id, updatedDoc.data()) : null;

    return res.json({
      message: "Formacion actualizada exitosamente",
      id: id,
      ...(updatedData && { curso: updatedData }),
    });
  } catch (err) {
    console.error("updateCourse error:", err);
    return res.status(500).json({ error: "Error al actualizar formacion" });
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
      return res.status(404).json({ error: "Formacion no encontrada" });
    }

    await collection.doc(id).delete();

    // ✅ CACHÉ: Invalidar caché de formaciones al eliminar
    cache.invalidatePattern(`${CACHE_KEYS.COURSES}:`);

    return res.json({
      message: "Formacion eliminada exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("deleteCourse error:", err);
    return res.status(500).json({ error: "Error al eliminar formacion" });
  }
};

export const checkCourseExists = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await collection.doc(id).get();
    return res.json({ exists: doc.exists });
  } catch (err) {
    console.error("checkCourseExists error:", err);
    return res.status(500).json({ error: "Error al verificar formacion" });
  }
};


export const selectRandomFeaturedCourse = async (req: Request, res: Response) => {
  try {
    const activeSnapshot = await collection.where('estado', '==', 'activo').get();

    if (activeSnapshot.empty) {
      return res.status(404).json({ 
        error: 'No hay formaciones activas disponibles' 
      });
    }

    const currentFeaturedSnapshot = await collection
      .where('esDestacado', '==', true)
      .limit(1)
      .get();

    const currentFeaturedId = currentFeaturedSnapshot.empty 
      ? null 
      : currentFeaturedSnapshot.docs[0].id;

    const availableCourses = activeSnapshot.docs
      .filter(doc => doc.id !== currentFeaturedId)
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ref: doc.ref,
          titulo: data.titulo || '',
          descripcion_corta: data.descripcion_corta || '',
          ...data
        };
      });

    if (availableCourses.length === 0) {
      return res.status(400).json({ 
        error: 'No hay otras formaciones activas para destacar (solo hay una formación activa o ninguna diferente a la actual)' 
      });
    }

    const randomIndex = Math.floor(Math.random() * availableCourses.length);
    const selectedCourse = availableCourses[randomIndex];

    const batch = firestore.batch();
    
    if (currentFeaturedId) {
      const previousRef = collection.doc(currentFeaturedId);
      batch.update(previousRef, { esDestacado: false });
      console.log(`   ❌ Quitando destacado de: ${currentFeaturedId}`);
    }
    
    batch.update(selectedCourse.ref, { esDestacado: true });

    await batch.commit();

    cache.invalidatePattern(`${CACHE_KEYS.COURSES}:`);

    return res.json({
      success: true,
      message: 'Formación destacada seleccionada exitosamente',
      previousFeatured: currentFeaturedId ? {
        id: currentFeaturedId
      } : null,
      newFeatured: {
        id: selectedCourse.id,
        titulo: selectedCourse.titulo,
        descripcion_corta: selectedCourse.descripcion_corta
      }
    });

  } catch (err) {
    console.error('❌ selectRandomFeaturedCourse error:', err);
    return res.status(500).json({ 
      error: 'Error al seleccionar formación destacada' 
    });
  }
}; 

