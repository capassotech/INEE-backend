import { firestore } from "../config/firebase";
import { AuthenticatedRequest } from "../middleware/authMiddleware";



// Validar que el rol del usuario sea admin
export const validateUser = async (req: AuthenticatedRequest) => {
    const userId = req.user.uid;
    if (!userId) return false;
    const userDoc = await firestore.collection("users").doc(userId).get();
    const userData = userDoc.data();
    return userData?.role === "admin";
};
