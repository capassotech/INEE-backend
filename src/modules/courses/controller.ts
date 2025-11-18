import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { ValidatedCourse, ValidatedUpdateCourse } from "../../types/courses";
import { validateUser } from "../../utils/utils";

const collection = firestore.collection("courses");

export const getAllCourses = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '20'), 100); // Máximo 100
    const lastId = req.query.lastId as string | undefined;
    
    let query = collection
      .orderBy('__name__') // Ordenar por ID del documento
      .limit(limit);
    
    // Si hay un lastId, continuar desde ahí
    if (lastId) {
      const lastDoc = await collection.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    // Consultar limit + 1 para saber si hay más documentos
    const extendedQuery = lastId 
      ? collection.orderBy('__name__').startAfter(await collection.doc(lastId).get()).limit(limit + 1)
      : collection.orderBy('__name__').limit(limit + 1);
    
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
    const courses = docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    const lastDoc = docs[docs.length - 1];
    // Si hay más documentos que el límite, entonces hay más páginas
    const hasMore = snapshot.docs.length > limit;

    return res.json({
      courses,
      pagination: {
        hasMore,
        lastId: lastDoc?.id,
        limit,
        count: courses.length
      }
    });
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
    
    console.log('🔍 [getUserCourses] Request params:', { 
      id, 
      limit, 
      lastId, 
      queryLimit: req.query.limit,
      queryLastId: req.query.lastId 
    });
    
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
    
    // Obtener los IDs para la página actual
    const pageCourseIds = uniqueCourseIds.slice(startIndex, startIndex + limit + 1);
    const hasMore = pageCourseIds.length > limit;
    const currentPageIds = hasMore ? pageCourseIds.slice(0, limit) : pageCourseIds;
    
    console.log('📦 [getUserCourses] Pagination logic:', {
      totalCourseIds: uniqueCourseIds.length,
      startIndex,
      limit,
      pageCourseIdsCount: pageCourseIds.length,
      currentPageIdsCount: currentPageIds.length,
      hasMore
    });
    
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
    const uniqueCourses = coursesData.filter((course, index, self) =>
      index === self.findIndex((c) => c.id === course.id)
    );

    const lastCourseId = currentPageIds[currentPageIds.length - 1];

    const responseData = {
      courses: uniqueCourses,
      pagination: {
        hasMore,
        lastId: lastCourseId || null,
        limit,
        count: uniqueCourses.length
      }
    };

    console.log('📤 [getUserCourses] Returning response:', {
      coursesCount: uniqueCourses.length,
      hasMore,
      lastId: lastCourseId,
      limit,
      responseStructure: Object.keys(responseData)
    });

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

    const profesorExists = await firestore
      .collection("profesores")
      .doc(courseData.id_profesor)
      .get();
    if (!profesorExists.exists) {
      return res
        .status(404)
        .json({ error: "El profesor especificado no existe" });
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
      const profesorExists = await firestore
        .collection("profesores")
        .doc(updateData.id_profesor)
        .get();
      if (!profesorExists.exists) {
        return res
          .status(404)
          .json({ error: "El profesor especificado no existe" });
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
    return res.json({
      message: "Curso eliminado exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("deleteCourse error:", err);
    return res.status(500).json({ error: "Error al eliminar curso" });
  }
};

