import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser, normalizeText } from "../../utils/utils";
import { ValidatedCreateRecomendacion, ValidatedUpdateRecomendacion } from "../../types/recomendaciones";

const collection = firestore.collection("recomendaciones");

export const getAllRecomendaciones = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "20"), 100); 
    const lastId = req.query.lastId as string | undefined;
    const search = req.query.search as string | undefined; 

    const queryLimit = search && search.trim() ? limit * 3 : limit; 

    let query = collection.orderBy("createdAt", "desc");

    if (lastId) {
      const lastDoc = await collection.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const extendedQuery = query.limit(queryLimit + 1);
    const snapshot = await extendedQuery.get();

    if (snapshot.empty) {
      return res.json({
        recomendaciones: [],
        pagination: {
          hasMore: false,
          lastId: null,
          limit,
          count: 0,
        },
      });
    }

    const docs = snapshot.docs.slice(0, queryLimit);
    let recomendaciones = docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (search && search.trim()) {
      const searchNormalized = normalizeText(search);
      recomendaciones = recomendaciones.filter((recomendacion: any) => {
        const titulo = normalizeText(recomendacion.titulo || "");
        const descripcion = normalizeText(recomendacion.descripcion || "");
        return (
          titulo.includes(searchNormalized) ||
          descripcion.includes(searchNormalized)
        );
      });
      recomendaciones = recomendaciones.slice(0, limit);
    }

    const lastDoc = docs[docs.length - 1];
    const hasMore = snapshot.docs.length > queryLimit;

    return res.json({
      recomendaciones,
      pagination: {
        hasMore,
        lastId: lastDoc?.id,
        limit,
        count: recomendaciones.length,
      },
    });
  } catch (err) {
    console.error("getAllRecomendaciones error:", err);
    return res.status(500).json({ error: "Error al obtener recomendaciones" });
  }
};

export const getRecomendacionById = async (req: Request, res: Response) => {
  try {
    const recomendacionId = req.params.id;
    const recomendacion = await collection.doc(recomendacionId).get();

    if (!recomendacion.exists) {
      return res.status(404).json({ error: "Recomendación no encontrada" });
    }

    return res.json({ id: recomendacion.id, ...recomendacion.data() });
  } catch (err) {
    console.error("getRecomendacionById error:", err);
    return res.status(500).json({ error: "Error al obtener recomendación" });
  }
};

export const createRecomendacion = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const recomendacionData: ValidatedCreateRecomendacion = req.body;
    const now = new Date();

    const newRecomendacion: any = {
      ...recomendacionData,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await collection.add(newRecomendacion);
    const createdDoc = await docRef.get();

    return res.status(201).json({
      id: createdDoc.id,
      ...createdDoc.data(),
      message: "Recomendación creada exitosamente",
    });
  } catch (err: any) {
    console.error("createRecomendacion error:", err);
    return res.status(500).json({
      error: "Error al crear recomendación",
      message: err?.message || "Error inesperado",
    });
  }
};

export const updateRecomendacion = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const recomendacionId = req.params.id;
    const updateData: ValidatedUpdateRecomendacion = req.body;

    const recomendacionRef = collection.doc(recomendacionId);
    const recomendacionDoc = await recomendacionRef.get();

    if (!recomendacionDoc.exists) {
      return res.status(404).json({ error: "Recomendación no encontrada" });
    }

    const updatedData: any = {
      ...updateData,
      updatedAt: new Date(),
    };

    await recomendacionRef.update(updatedData);
    const updatedDoc = await recomendacionRef.get();

    return res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
      message: "Recomendación actualizada exitosamente",
    });
  } catch (err: any) {
    console.error("updateRecomendacion error:", err);
    return res.status(500).json({
      error: "Error al actualizar recomendación",
      message: err?.message || "Error inesperado",
    });
  }
};

export const deleteRecomendacion = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const recomendacionId = req.params.id;
    const recomendacionRef = collection.doc(recomendacionId);
    const recomendacionDoc = await recomendacionRef.get();

    if (!recomendacionDoc.exists) {
      return res.status(404).json({ error: "Recomendación no encontrada" });
    }

    await recomendacionRef.delete();

    return res.json({
      success: true,
      message: "Recomendación eliminada exitosamente",
    });
  } catch (err: any) {
    console.error("deleteRecomendacion error:", err);
    return res.status(500).json({
      error: "Error al eliminar recomendación",
      message: err?.message || "Error inesperado",
    });
  }
};
