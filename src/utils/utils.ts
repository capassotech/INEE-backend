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
 * Normaliza un texto eliminando tildes y convirtiendo a minúsculas
 * Esto permite que las búsquedas funcionen independientemente de si tienen tildes o no
 * Ejemplo: "formación" y "formacion" ambos se normalizan a "formacion"
 */
export const normalizeText = (text: string): string => {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD') // Descompone caracteres con tildes (á -> a + ´)
        .replace(/[\u0300-\u036f]/g, '') // Elimina los diacríticos (tildes)
        .trim();
};