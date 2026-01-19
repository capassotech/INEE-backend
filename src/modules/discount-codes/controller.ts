import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";
import {
  ValidatedCreateDiscountCode,
  ValidatedUpdateDiscountCode,
} from "../../types/discount-codes";

const collection = firestore.collection("discount_codes");

export const getAllDiscountCodes = async (req: Request, res: Response) => {
  try {
    const snapshot = await collection.orderBy("__name__").get();

    const codes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(codes);
  } catch (error) {
    console.error("getAllDiscountCodes error:", error);
    return res
      .status(500)
      .json({ error: "Error al obtener los códigos de descuento" });
  }
};

export const createDiscountCode = async (
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
    const data: ValidatedCreateDiscountCode = req.body;

    const now = new Date().toISOString();

    const docRef = await collection.add({
      codigo: data.codigo,
      porcentaje: data.porcentaje,
      createdAt: now,
      updatedAt: now,
    });

    const createdDoc = await docRef.get();

    return res.status(201).json({
      id: createdDoc.id,
      ...createdDoc.data(),
    });
  } catch (error) {
    console.error("createDiscountCode error:", error);
    return res
      .status(500)
      .json({ error: "Error al crear el código de descuento" });
  }
};

export const updateDiscountCode = async (
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
    const data: ValidatedUpdateDiscountCode = req.body;

    const doc = await collection.doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Código de descuento no encontrado" });
    }

    const updatePayload: any = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await collection.doc(id).update(updatePayload);

    const updatedDoc = await collection.doc(id).get();

    return res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
    });
  } catch (error) {
    console.error("updateDiscountCode error:", error);
    return res
      .status(500)
      .json({ error: "Error al actualizar el código de descuento" });
  }
};

export const deleteDiscountCode = async (
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

    const doc = await collection.doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Código de descuento no encontrado" });
    }

    await collection.doc(id).delete();

    return res.json({
      message: "Código de descuento eliminado exitosamente",
      id,
    });
  } catch (error) {
    console.error("deleteDiscountCode error:", error);
    return res
      .status(500)
      .json({ error: "Error al eliminar el código de descuento" });
  }
};

