import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";

const collection = firestore.collection("examenes");

// Obtener todos los exámenes con paginación y búsqueda
export const getAllExamenes = async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "10",
      search = "",
      id_formacion = "",
      estado = "",
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const offset = (pageNumber - 1) * limitNumber;

    let query = collection.orderBy("createdAt", "desc");

    // Filtros
    if (id_formacion) {
      query = query.where("id_formacion", "==", id_formacion) as any;
    }

    if (estado) {
      query = query.where("estado", "==", estado) as any;
    }

    const snapshot = await query.get();

    let examenes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Búsqueda por título
    if (search) {
      const searchLower = (search as string).toLowerCase();
      examenes = examenes.filter((examen: any) =>
        examen.titulo?.toLowerCase().includes(searchLower)
      );
    }

    const total = examenes.length;
    const paginatedExamenes = examenes.slice(offset, offset + limitNumber);

    return res.json({
      examenes: paginatedExamenes,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error: any) {
    console.error("Error al obtener exámenes:", error);
    return res.status(500).json({
      message: "Error al obtener exámenes",
      error: error.message,
    });
  }
};

// Obtener examen por ID
export const getExamenById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const doc = await collection.doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Examen no encontrado" });
    }

    return res.json({
      id: doc.id,
      ...doc.data(),
    });
  } catch (error: any) {
    console.error("Error al obtener examen:", error);
    return res.status(500).json({
      message: "Error al obtener examen",
      error: error.message,
    });
  }
};

// Crear examen
export const createExamen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    // Validar que el usuario existe y es admin
    await validateUser(req as AuthenticatedRequest);

    const { titulo, id_formacion, preguntas, estado = "activo" } = req.body;

    // Validaciones
    if (!titulo || !id_formacion || !preguntas) {
      return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    if (!Array.isArray(preguntas) || preguntas.length === 0) {
      return res.status(400).json({ message: "Debe haber al menos una pregunta" });
    }

    // Validar cada pregunta
    for (const pregunta of preguntas) {
      if (!pregunta.texto || !pregunta.respuestas || !Array.isArray(pregunta.respuestas)) {
        return res.status(400).json({ message: "Cada pregunta debe tener texto y respuestas" });
      }

      if (pregunta.respuestas.length < 2) {
        return res.status(400).json({ message: "Cada pregunta debe tener al menos 2 respuestas" });
      }

      const respuestasCorrectas = pregunta.respuestas.filter((r: any) => r.esCorrecta);
      if (respuestasCorrectas.length === 0) {
        return res.status(400).json({ message: "Cada pregunta debe tener al menos una respuesta correcta" });
      }
    }

    // Validar que no exista ya un examen activo para esta formación
    const examenesExistentes = await collection
      .where("id_formacion", "==", id_formacion)
      .where("estado", "==", "activo")
      .get();

    if (!examenesExistentes.empty) {
      return res.status(400).json({ 
        message: "Ya existe un examen activo para esta formación. Solo se permite un examen por formación." 
      });
    }

    const examenData = {
      titulo,
      id_formacion,
      preguntas,
      estado,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await collection.add(examenData);

    return res.status(201).json({
      id: docRef.id,
      ...examenData,
      message: "Examen creado exitosamente",
    });
  } catch (error: any) {
    console.error("Error al crear examen:", error);
    return res.status(500).json({
      message: "Error al crear examen",
      error: error.message,
    });
  }
};

// Actualizar examen
export const updateExamen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    // Validar que el usuario existe y es admin
    await validateUser(req as AuthenticatedRequest);

    const { id } = req.params;
    const { titulo, id_formacion, preguntas, estado } = req.body;

    const doc = await collection.doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Examen no encontrado" });
    }

    const examenActual = doc.data();

    // Si se está cambiando la formación, validar que no exista ya un examen activo para la nueva formación
    if (id_formacion && id_formacion !== examenActual?.id_formacion) {
      const examenesExistentes = await collection
        .where("id_formacion", "==", id_formacion)
        .where("estado", "==", "activo")
        .get();

      // Excluir el examen actual de la validación
      const examenesOtros = examenesExistentes.docs.filter(doc => doc.id !== id);
      
      if (examenesOtros.length > 0) {
        return res.status(400).json({ 
          message: "Ya existe un examen activo para esta formación. Solo se permite un examen por formación." 
        });
      }
    }

    // Validaciones similares al create
    if (preguntas) {
      if (!Array.isArray(preguntas) || preguntas.length === 0) {
        return res.status(400).json({ message: "Debe haber al menos una pregunta" });
      }

      for (const pregunta of preguntas) {
        if (!pregunta.texto || !pregunta.respuestas || !Array.isArray(pregunta.respuestas)) {
          return res.status(400).json({ message: "Cada pregunta debe tener texto y respuestas" });
        }

        if (pregunta.respuestas.length < 2) {
          return res.status(400).json({ message: "Cada pregunta debe tener al menos 2 respuestas" });
        }

        const respuestasCorrectas = pregunta.respuestas.filter((r: any) => r.esCorrecta);
        if (respuestasCorrectas.length === 0) {
          return res.status(400).json({ message: "Cada pregunta debe tener al menos una respuesta correcta" });
        }
      }
    }

    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (titulo !== undefined) updateData.titulo = titulo;
    if (id_formacion !== undefined) updateData.id_formacion = id_formacion;
    if (preguntas !== undefined) updateData.preguntas = preguntas;
    if (estado !== undefined) updateData.estado = estado;

    await collection.doc(id).update(updateData);

    const updatedDoc = await collection.doc(id).get();

    return res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
      message: "Examen actualizado exitosamente",
    });
  } catch (error: any) {
    console.error("Error al actualizar examen:", error);
    return res.status(500).json({
      message: "Error al actualizar examen",
      error: error.message,
    });
  }
};

// Eliminar examen
export const deleteExamen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    // Validar que el usuario existe y es admin
    await validateUser(req as AuthenticatedRequest);

    const { id } = req.params;

    const doc = await collection.doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Examen no encontrado" });
    }

    await collection.doc(id).delete();

    return res.json({ message: "Examen eliminado exitosamente" });
  } catch (error: any) {
    console.error("Error al eliminar examen:", error);
    return res.status(500).json({
      message: "Error al eliminar examen",
      error: error.message,
    });
  }
};

// Obtener exámenes por formación
export const getExamenesByFormacion = async (req: Request, res: Response) => {
  try {
    const { id_formacion } = req.params;

    if (!id_formacion) {
      return res.status(400).json({ message: "ID de formación requerido" });
    }

    // Quitar el orderBy para evitar necesidad de índice compuesto
    const snapshot = await collection
      .where("id_formacion", "==", id_formacion)
      .where("estado", "==", "activo")
      .get();

    if (snapshot.empty) {
      return res.json({ examenes: [] });
    }

    const examenes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Ordenar en memoria por createdAt descendente
    examenes.sort((a: any, b: any) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return res.json({ examenes });
  } catch (error: any) {
    console.error("Error al obtener exámenes por formación:", error);
    return res.status(500).json({
      message: "Error al obtener exámenes por formación",
      error: error.message,
    });
  }
};

