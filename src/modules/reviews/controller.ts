import { firestore } from "../../config/firebase";
import { Request, Response } from "express";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { ValidatedCreateReview } from "../../types/reviews";

export const createReview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courseId, rating, comment } = req.body as ValidatedCreateReview;
    const userId = req.user.uid; 

    const existing = await firestore
      .collection("reviews")
      .where("userId", "==", userId)
      .where("courseId", "==", courseId)
      .get();

    if (!existing.empty) {
      return res.status(400).json({ error: "Ya dejaste una reseña para este curso." });
    }

    const newReview = {
      userId,
      courseId,
      rating,
      comment: comment?.trim() || null,
      createdAt: new Date(),
    };

    const docRef = await firestore.collection("reviews").add(newReview);
    
    return res.status(201).json({
      id: docRef.id,
      ...newReview,
    });
  } catch (error) {
    console.error("Error al crear reseña:", error);
    return res.status(500).json({ error: "Error al guardar la reseña" });
  }
};

// Endpoint público para mostrar reseñas
export const getReviewsByCourse = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const snapshot = await firestore
      .collection("reviews")
      .where("courseId", "==", courseId)
      .orderBy("createdAt", "desc")
      .get();

    const reviews = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(reviews);
  } catch (error) {
    console.error("Error al obtener reseñas:", error);
    return res.status(500).json({ error: "Error al cargar reseñas" });
  }
};