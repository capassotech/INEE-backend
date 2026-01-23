import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";

const collection = firestore.collection("examenes_realizados");

// Crear un examen realizado
export const createExamenRealizado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const { id_examen, id_formacion, respuestas, nota, aprobado, intento, fecha_realizado } = req.body;

    // Validaciones
    if (!id_examen || !id_formacion || !respuestas || nota === undefined || aprobado === undefined || !intento) {
      return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    if (!Array.isArray(respuestas)) {
      return res.status(400).json({ message: "Las respuestas deben ser un array" });
    }

    if (nota < 0 || nota > 100) {
      return res.status(400).json({ message: "La nota debe estar entre 0 y 100" });
    }

    // Verificar si el usuario ya aprobó este examen
    const examenesAnteriores = await collection
      .where('id_usuario', '==', userId)
      .where('id_formacion', '==', id_formacion)
      .where('aprobado', '==', true)
      .get();

    if (!examenesAnteriores.empty) {
      return res.status(400).json({ 
        message: "Ya has aprobado este examen. No puedes realizar más intentos.",
        yaAprobado: true
      });
    }

    const examenRealizadoData = {
      id_examen,
      id_formacion,
      id_usuario: userId,
      respuestas,
      nota: Math.round(nota * 100) / 100, // Redondear a 2 decimales
      aprobado,
      intento,
      fecha_realizado: fecha_realizado || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await collection.add(examenRealizadoData);

    return res.status(201).json({
      id: docRef.id,
      ...examenRealizadoData,
      message: "Examen realizado guardado exitosamente"
    });
  } catch (error: any) {
    console.error("Error al crear examen realizado:", error);
    return res.status(500).json({ 
      message: "Error al guardar examen realizado",
      error: error.message 
    });
  }
};

// Obtener exámenes realizados por usuario y formación
export const getExamenesRealizadosByUsuarioYFormacion = async (req: Request, res: Response) => {
  try {
    const { idUsuario, idFormacion } = req.params;

    if (!idUsuario || !idFormacion) {
      return res.status(400).json({ message: "Faltan parámetros requeridos" });
    }

    const snapshot = await collection
      .where('id_usuario', '==', idUsuario)
      .where('id_formacion', '==', idFormacion)
      .get();

    if (snapshot.empty) {
      return res.json({ examenes: [] });
    }

    const examenes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    // Ordenar en memoria por fecha_realizado descendente
    examenes.sort((a: any, b: any) => {
      const dateA = new Date(a.fecha_realizado).getTime();
      const dateB = new Date(b.fecha_realizado).getTime();
      return dateB - dateA;
    });

    return res.json({ examenes });
  } catch (error: any) {
    console.error("Error al obtener exámenes realizados:", error);
    return res.status(500).json({ 
      message: "Error al obtener exámenes realizados",
      error: error.message 
    });
  }
};

// Obtener todos los exámenes realizados por id_examen
export const getExamenRealizadoById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const snapshot = await collection
      .where('id_examen', '==', id)
      .get();

    if (snapshot.empty) {
      return res.json({ examenes: [] });
    }

    const examenes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    examenes.sort((a: any, b: any) => {
      const dateA = new Date(a.fecha_realizado || a.createdAt || 0).getTime();
      const dateB = new Date(b.fecha_realizado || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return res.json({ examenes });
  } catch (error: any) {
    console.error("Error al obtener examen realizado:", error);
    return res.status(500).json({ 
      message: "Error al obtener examen realizado",
      error: error.message 
    });
  }
};

// Obtener último intento de examen por usuario y formación
export const getUltimoIntento = async (req: Request, res: Response) => {
  try {
    const { idUsuario, idFormacion } = req.params;

    if (!idUsuario || !idFormacion) {
      return res.status(400).json({ message: "Faltan parámetros requeridos" });
    }

    const snapshot = await collection
      .where('id_usuario', '==', idUsuario)
      .where('id_formacion', '==', idFormacion)
      .get();

    if (snapshot.empty) {
      return res.json({ examen: null });
    }

    // Ordenar en memoria y obtener el último
    const examenes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    examenes.sort((a: any, b: any) => {
      const dateA = new Date(a.fecha_realizado).getTime();
      const dateB = new Date(b.fecha_realizado).getTime();
      return dateB - dateA;
    });

    const examen = examenes[0];

    return res.json({ examen });
  } catch (error: any) {
    console.error("Error al obtener último intento:", error);
    return res.status(500).json({ 
      message: "Error al obtener último intento",
      error: error.message 
    });
  }
};

