import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";
import {
  ValidatedCreateMercadoPagoAccount,
  ValidatedUpdateMercadoPagoAccount,
} from "../../types/mercado-pago-accounts";

const collection = firestore.collection("mercado_pago_accounts");

export const getAllMercadoPagoAccounts = async (
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
    const snapshot = await collection.orderBy("createdAt", "desc").get();

    const accounts = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        nombreFantasia: data.nombreFantasia,
        accessToken: data.accessToken,
        publicKey: data.publicKey,
        activa: data.activa ?? true,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt,
      };
    });

    return res.json(accounts);
  } catch (error) {
    console.error("getAllMercadoPagoAccounts error:", error);
    return res.status(500).json({
      error: "Error al obtener las cuentas de Mercado Pago",
    });
  }
};

export const createMercadoPagoAccount = async (
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
    const data: ValidatedCreateMercadoPagoAccount = req.body;
    const now = new Date();

    const docRef = await collection.add({
      nombreFantasia: data.nombreFantasia,
      accessToken: data.accessToken,
      publicKey: data.publicKey,
      activa: data.activa ?? true,
      createdAt: now,
      updatedAt: now,
    });

    const createdDoc = await docRef.get();
    const createdData = createdDoc.data();

    return res.status(201).json({
      id: createdDoc.id,
      nombreFantasia: createdData?.nombreFantasia,
      accessToken: createdData?.accessToken,
      publicKey: createdData?.publicKey,
      activa: createdData?.activa ?? true,
      createdAt: createdData?.createdAt?.toDate?.()?.toISOString?.() ?? now.toISOString(),
      updatedAt: createdData?.updatedAt?.toDate?.()?.toISOString?.() ?? now.toISOString(),
    });
  } catch (error) {
    console.error("createMercadoPagoAccount error:", error);
    return res.status(500).json({
      error: "Error al crear la cuenta de Mercado Pago",
    });
  }
};

export const updateMercadoPagoAccount = async (
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
    const data: ValidatedUpdateMercadoPagoAccount = req.body;

    const docRef = collection.doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        error: "Cuenta de Mercado Pago no encontrada",
      });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.nombreFantasia !== undefined) updateData.nombreFantasia = data.nombreFantasia;
    if (data.accessToken !== undefined) updateData.accessToken = data.accessToken;
    if (data.publicKey !== undefined) updateData.publicKey = data.publicKey;
    if (data.activa !== undefined) updateData.activa = data.activa;

    await docRef.update(updateData);
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data();

    return res.json({
      id: updatedDoc.id,
      nombreFantasia: updatedData?.nombreFantasia,
      accessToken: updatedData?.accessToken,
      publicKey: updatedData?.publicKey,
      activa: updatedData?.activa ?? true,
      createdAt: updatedData?.createdAt?.toDate?.()?.toISOString?.() ?? null,
      updatedAt: updatedData?.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error("updateMercadoPagoAccount error:", error);
    return res.status(500).json({
      error: "Error al actualizar la cuenta de Mercado Pago",
    });
  }
};

export const deleteMercadoPagoAccount = async (
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
    const docRef = collection.doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        error: "Cuenta de Mercado Pago no encontrada",
      });
    }

    await docRef.delete();

    return res.json({
      success: true,
      message: "Cuenta de Mercado Pago eliminada exitosamente",
    });
  } catch (error) {
    console.error("deleteMercadoPagoAccount error:", error);
    return res.status(500).json({
      error: "Error al eliminar la cuenta de Mercado Pago",
    });
  }
};
