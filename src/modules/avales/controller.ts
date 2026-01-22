import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser, normalizeText } from "../../utils/utils";
import { ValidatedCreateAval, ValidatedUpdateAval } from "../../types/avales";

const collection = firestore.collection("avales");

export const getAllAvales = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "20"), 100); 
    const lastId = req.query.lastId as string | undefined;
    const search = req.query.search as string | undefined; 

    const queryLimit = search && search.trim() ? limit * 3 : limit; 

    let query = collection.orderBy("__name__");

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
        avales: [],
        pagination: {
          hasMore: false,
          lastId: null,
          limit,
          count: 0,
        },
      });
    }

    const docs = snapshot.docs.slice(0, queryLimit);
    let avales = docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (search && search.trim()) {
      const searchNormalized = normalizeText(search);
      avales = avales.filter((aval: any) => {
        const nombre = normalizeText(aval.nombre || "");
        const descripcion = normalizeText(aval.descripcion || "");
        const codigo = normalizeText(aval.codigo || "");
        return (
          nombre.includes(searchNormalized) ||
          descripcion.includes(searchNormalized) ||
          codigo.includes(searchNormalized)
        );
      });
      avales = avales.slice(0, limit);
    }

    const lastDoc = docs[docs.length - 1];
    const hasMore = snapshot.docs.length > queryLimit;

    return res.json({
      avales,
      pagination: {
        hasMore,
        lastId: lastDoc?.id,
        limit,
        count: avales.length,
      },
    });
  } catch (err) {
    console.error("getAllAvales error:", err);
    return res.status(500).json({ error: "Error al obtener avales" });
  }
};

export const getAvalById = async (req: Request, res: Response) => {
  try {
    const avalId = req.params.id;
    const aval = await collection.doc(avalId).get();

    if (!aval.exists) {
      return res.status(404).json({ error: "Aval no encontrado" });
    }

    return res.json({ id: aval.id, ...aval.data() });
  } catch (err) {
    console.error("getAvalById error:", err);
    return res.status(500).json({ error: "Error al obtener aval" });
  }
};

export const createAval = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const avalData: ValidatedCreateAval = req.body;
    const now = new Date();

    const newAval: any = {
      ...avalData,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await collection.add(newAval);
    const createdDoc = await docRef.get();

    return res.status(201).json({
      id: createdDoc.id,
      ...createdDoc.data(),
      message: "Aval creado exitosamente",
    });
  } catch (err: any) {
    console.error("createAval error:", err);
    return res.status(500).json({
      error: "Error al crear aval",
      message: err?.message || "Error inesperado",
    });
  }
};

export const updateAval = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const avalId = req.params.id;
    const updateData: ValidatedUpdateAval = req.body;

    const avalRef = collection.doc(avalId);
    const avalDoc = await avalRef.get();

    if (!avalDoc.exists) {
      return res.status(404).json({ error: "Aval no encontrado" });
    }

    const updatedData: any = {
      ...updateData,
      updatedAt: new Date(),
    };

    await avalRef.update(updatedData);
    const updatedDoc = await avalRef.get();

    return res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
      message: "Aval actualizado exitosamente",
    });
  } catch (err: any) {
    console.error("updateAval error:", err);
    return res.status(500).json({
      error: "Error al actualizar aval",
      message: err?.message || "Error inesperado",
    });
  }
};

export const deleteAval = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const avalId = req.params.id;
    const avalRef = collection.doc(avalId);
    const avalDoc = await avalRef.get();

    if (!avalDoc.exists) {
      return res.status(404).json({ error: "Aval no encontrado" });
    }

    await avalRef.delete();

    return res.json({
      success: true,
      message: "Aval eliminado exitosamente",
    });
  } catch (err: any) {
    console.error("deleteAval error:", err);
    return res.status(500).json({
      error: "Error al eliminar aval",
      message: err?.message || "Error inesperado",
    });
  }
};
