import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser, normalizeText } from "../../utils/utils";
import {
  matchesSearch,
  paginateByPage,
  parseLimit,
  parsePage,
} from "../../utils/listQuery";
import { ValidatedCreateAval, ValidatedUpdateAval } from "../../types/avales";

const collection = firestore.collection("avales");

export const getAllAvales = async (req: Request, res: Response) => {
  try {
    const limit = parseLimit(req.query.limit as string, 10, 100);
    const page = parsePage(req.query.page as string, 1);
    const search = req.query.search as string | undefined;

    const snapshot = await collection.orderBy("__name__").get();
    let avales = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    avales = avales.filter((aval: Record<string, unknown>) =>
      matchesSearch(search, [
        String(aval.nombre || aval.titulo || ""),
        String(aval.descripcion || ""),
        String(aval.codigo || ""),
      ])
    );

    const paginated = paginateByPage(avales, page, limit);

    return res.json({
      avales: paginated.items,
      pagination: {
        page,
        totalPages: paginated.totalPages,
        totalCount: paginated.total,
        hasMore: paginated.hasMore,
        limit,
        count: paginated.items.length,
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
