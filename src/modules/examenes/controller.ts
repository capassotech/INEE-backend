import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";

const collection = firestore.collection("examenes");

// Obtener todos los exámenes
export const getAllExamenes = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '20'), 100);
    const lastId = req.query.lastId as string | undefined;
    const search = req.query.search as string | undefined;
    
    let query = collection.orderBy('createdAt', 'desc');
    
    if (lastId) {
      const lastDoc = await collection.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const extendedQuery = query.limit(limit + 1);
    const snapshot = await extendedQuery.get();

    if (snapshot.empty) {
      return res.json({
        examenes: [],
        pagination: {
          hasMore: false,
          lastId: null,
          limit,
          count: 0
        }
      });
    }

    const docs = snapshot.docs.slice(0, limit);
    let examenes = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
      };
    });
    
    // Aplicar búsqueda si existe
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      examenes = examenes.filter((examen: any) => 
        examen.titulo?.toLowerCase().includes(searchLower)
      );
    }
    
    const hasMore = snapshot.docs.length > limit;
    const lastDocId = docs.length > 0 ? docs[docs.length - 1].id : null;
    
    return res.json({
      examenes,
      pagination: {
        hasMore,
        lastId: lastDocId,
        limit,
        count: examenes.length
      }
    });
  } catch (error: any) {
    console.error("Error al obtener exámenes:", error);
    return res.status(500).json({ 
      message: "Error al obtener exámenes",
      error: error.message 
    });
  }
};

// Obtener un examen por ID
export const getExamenById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const doc = await collection.doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ message: "Examen no encontrado" });
    }
    
    return res.json({
      id: doc.id,
      ...doc.data()
    });
  } catch (error: any) {
    console.error("Error al obtener examen:", error);
    return res.status(500).json({ 
      message: "Error al obtener examen",
      error: error.message 
    });
  }
};

// Crear un nuevo examen
export const createExamen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const isAdmin = await validateUser(req);
    if (!isAdmin) {
      return res.status(403).json({ message: "Acceso denegado. Solo administradores pueden crear exámenes." });
    }

    const { titulo, id_formacion, preguntas, estado } = req.body;

    // Validaciones básicas
    if (!titulo || !id_formacion || !preguntas) {
      return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    if (!Array.isArray(preguntas) || preguntas.length === 0) {
      return res.status(400).json({ message: "Debe incluir al menos una pregunta" });
    }

    // Validar que cada pregunta tenga al menos una respuesta correcta
    for (const pregunta of preguntas) {
      if (!pregunta.texto || !pregunta.respuestas || !Array.isArray(pregunta.respuestas)) {
        return res.status(400).json({ message: "Cada pregunta debe tener texto y respuestas" });
      }

      const tieneCorrecta = pregunta.respuestas.some((r: any) => r.esCorrecta === true);
      if (!tieneCorrecta) {
        return res.status(400).json({ 
          message: `La pregunta "${pregunta.texto}" debe tener al menos una respuesta correcta` 
        });
      }
    }

    const examenData = {
      titulo,
      id_formacion,
      preguntas,
      estado: estado || "activo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await collection.add(examenData);

    return res.status(201).json({
      id: docRef.id,
      ...examenData,
      message: "Examen creado exitosamente"
    });
  } catch (error: any) {
    console.error("Error al crear examen:", error);
    return res.status(500).json({ 
      message: "Error al crear examen",
      error: error.message 
    });
  }
};

// Actualizar un examen
export const updateExamen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const isAdmin = await validateUser(req);
    if (!isAdmin) {
      return res.status(403).json({ message: "Acceso denegado. Solo administradores pueden actualizar exámenes." });
    }

    const { id } = req.params;
    const { titulo, id_formacion, preguntas, estado } = req.body;

    const doc = await collection.doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Examen no encontrado" });
    }

    // Validar preguntas si se están actualizando
    if (preguntas) {
      if (!Array.isArray(preguntas) || preguntas.length === 0) {
        return res.status(400).json({ message: "Debe incluir al menos una pregunta" });
      }

      for (const pregunta of preguntas) {
        if (!pregunta.texto || !pregunta.respuestas || !Array.isArray(pregunta.respuestas)) {
          return res.status(400).json({ message: "Cada pregunta debe tener texto y respuestas" });
        }

        const tieneCorrecta = pregunta.respuestas.some((r: any) => r.esCorrecta === true);
        if (!tieneCorrecta) {
          return res.status(400).json({ 
            message: `La pregunta "${pregunta.texto}" debe tener al menos una respuesta correcta` 
          });
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
      message: "Examen actualizado exitosamente"
    });
  } catch (error: any) {
    console.error("Error al actualizar examen:", error);
    return res.status(500).json({ 
      message: "Error al actualizar examen",
      error: error.message 
    });
  }
};

// Eliminar un examen
export const deleteExamen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const isAdmin = await validateUser(req);
    if (!isAdmin) {
      return res.status(403).json({ message: "Acceso denegado. Solo administradores pueden eliminar exámenes." });
    }

    const { id } = req.params;

    const doc = await collection.doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Examen no encontrado" });
    }

    await collection.doc(id).delete();

    return res.json({ 
      message: "Examen eliminado exitosamente",
      id 
    });
  } catch (error: any) {
    console.error("Error al eliminar examen:", error);
    return res.status(500).json({ 
      message: "Error al eliminar examen",
      error: error.message 
    });
  }
};

// Obtener exámenes por formación
export const getExamenesByFormacion = async (req: Request, res: Response) => {
  try {
    const { id_formacion } = req.params;
    
    const snapshot = await collection
      .where('id_formacion', '==', id_formacion)
      .orderBy('createdAt', 'desc')
      .get();
    
    if (snapshot.empty) {
      return res.json({ examenes: [] });
    }
    
    const examenes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return res.json({ examenes });
  } catch (error: any) {
    console.error("Error al obtener exámenes por formación:", error);
    return res.status(500).json({ 
      message: "Error al obtener exámenes por formación",
      error: error.message 
    });
  }
};

