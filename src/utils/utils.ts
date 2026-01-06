import { firestore, storage } from "../config/firebase";
import { AuthenticatedRequest } from "../middleware/authMiddleware";



// Validar que el rol del usuario sea admin
export const validateUser = async (req: AuthenticatedRequest) => {
    const userId = req.user.uid;
    if (!userId) return false;
    const userDoc = await firestore.collection("users").doc(userId).get();
    const userData = userDoc.data();
    return userData?.role === "admin";
};

/**
 * Normaliza un texto removiendo tildes y convirtiendo a minúsculas
 * para permitir búsquedas sin importar si el usuario escribe con o sin tildes
 * 
 * @param text - Texto a normalizar
 * @returns Texto normalizado sin tildes y en minúsculas
 * 
 * @example
 * normalizeText("formación") // "formacion"
 * normalizeText("Formación") // "formacion"
 * normalizeText("José") // "jose"
 * normalizeText("consultoría") // "consultoria"
 */
export const normalizeText = (text: string): string => {
  if (!text) return "";
  
  return text
    .toLowerCase()
    .normalize("NFD") // Descompone caracteres con tildes (á -> a + ´)
    .replace(/[\u0300-\u036f]/g, "") // Remueve los diacríticos (tildes)
    .trim();
};