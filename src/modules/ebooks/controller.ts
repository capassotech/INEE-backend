import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";
import { ValidatedCreateEbook, ValidatedUpdateEbook } from "../../types/ebooks";

const collection = firestore.collection("ebooks");

// ✅ Obtener todos los ebooks
export const getAllEbooks = async (_: Request, res: Response) => {
  try {
    const snapshot = await collection.get();
    const ebooks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return res.json(ebooks);
  } catch (err) {
    console.error("getAllEbooks error:", err);
    return res.status(500).json({ error: "Error al obtener ebooks" });
  }
};

// ✅ Obtener ebook por ID
export const getEbookById = async (req: Request, res: Response) => {
  try {
    const ebookId = req.params.id;
    const ebook = await collection.doc(ebookId).get();

    if (!ebook.exists) {
      return res.status(404).json({ error: "Ebook no encontrado" });
    }

    return res.json({ id: ebook.id, ...ebook.data() });
  } catch (err) {
    console.error("getEbookById error:", err);
    return res.status(500).json({ error: "Error al obtener ebook" });
  }
};

export const createEbook = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res
      .status(403)
      .json({ error: "No autorizado. Se requieren permisos de administrador." });
  }

  try {
    const ebookData: ValidatedCreateEbook = req.body;
    const newEbook: any = { ...ebookData };

    const docRef = await collection.add(newEbook);
    const createdDoc = await docRef.get();

    return res.status(201).json({
      id: createdDoc.id,
      ...createdDoc.data(),
      message: "Ebook creado exitosamente",
    });
  } catch (err) {
    console.error("❌ [CREATE EBOOK ERROR]:", err);
    return res.status(500).json({ error: "Error al crear ebook" });
  }
};

export const updateEbook = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res
      .status(403)
      .json({ error: "No autorizado. Se requieren permisos de administrador." });
  }

  try {
    const ebookId = req.params.id;
    const updateData: ValidatedUpdateEbook = req.body;

    const ebookDoc = await collection.doc(ebookId).get();
    if (!ebookDoc.exists) {
      return res.status(404).json({ error: "Ebook no encontrado" });
    }
    const dataToUpdate: any = { ...updateData };

    await collection.doc(ebookId).update(dataToUpdate);


    return res.json({
      message: "Ebook actualizado exitosamente",
      id: ebookId,
    });
  } catch (err) {
    console.error("❌ [UPDATE EBOOK ERROR]:", err);
    return res.status(500).json({ error: "Error al actualizar ebook" });
  }
};

// ✅ Eliminar ebook
export const deleteEbook = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const ebookId = req.params.id;
    await collection.doc(ebookId).delete();
    return res.json({ message: "Ebook eliminado exitosamente" });
  } catch (err) {
    return res.status(500).json({ error: "Error al eliminar ebook" });
  }
};
