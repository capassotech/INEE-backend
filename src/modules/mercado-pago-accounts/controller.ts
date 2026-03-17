import { Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";

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
    const snapshot = await collection.get();

    const accounts = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        titulo: data.titulo || data.nombreFantasia || "",
        activo: data.activo ?? false,
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

export const updateMercadoPagoAccountActivo = async (
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
    const { activo } = req.body;

    const docRef = collection.doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        error: "Cuenta de Mercado Pago no encontrada",
      });
    }

    const batch = firestore.batch();

    if (activo === true) {
      // Si se marca como activa, quitar activo de todas las demás
      const allSnapshot = await collection.get();
      allSnapshot.docs.forEach((d) => {
        if (d.id !== id) {
          batch.update(d.ref, { activo: false, updatedAt: new Date() });
        }
      });
    }

    // Actualizar el registro seleccionado
    batch.update(docRef, { activo, updatedAt: new Date() });
    await batch.commit();

    const updatedDoc = await docRef.get();
    const data = updatedDoc.data();

    return res.json({
      id: updatedDoc.id,
      titulo: data?.titulo || data?.nombreFantasia || "",
      activo: data?.activa ?? false,
    });
  } catch (error) {
    console.error("updateMercadoPagoAccountActivo error:", error);
    return res.status(500).json({
      error: "Error al actualizar la cuenta de Mercado Pago",
    });
  }
};
