import { firestore } from "../../config/firebase";
import cron from "node-cron";
import { Resend } from "resend";
import { Request, Response } from "express";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { ValidatedCreateReview } from "../../types/reviews";

const frontendUrl = "http://localhost:8080";

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


export const reminderReview = async (req: Request, res: Response) => {
  try {
    const { userId, courseId } = req.body;

    const user = await firestore.collection("users").doc(userId).get();
    if (!user.exists) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const course = await firestore.collection("courses").doc(courseId).get();
    if (!course.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    const reminderSnapshot = await firestore
      .collection("review_reminders")
      .where("userId", "==", userId)
      .where("courseId", "==", courseId)
      .get();
    const hasScheduled = reminderSnapshot.docs.some((d) => (d.data() as any)?.status === "scheduled");
    if (hasScheduled) {
      return res.status(400).json({ error: "Ya existe un recordatorio para este usuario y curso" });
    }

    const userData = user.data() as any;
    const email: string | undefined = userData?.email;
    if (!email) {
      return res.status(400).json({ error: "El usuario no tiene email" });
    }

    const sendAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // const sendAt = new Date(Date.now() + 2 * 60 * 1000);

    const reminderRef = await firestore.collection("review_reminders").add({
      userId,
      courseId,
      email,
      sendAt,
      createdAt: new Date(),
      status: "scheduled",
    });

    const minute = sendAt.getMinutes();
    const hour = sendAt.getHours();
    const dayOfMonth = sendAt.getDate();
    const month = sendAt.getMonth() + 1; 
    const cronExpr = `${minute} ${hour} ${dayOfMonth} ${month} *`;

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY no está configurada");
      return res.status(500).json({ error: "Configuración de email inválida" });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const job = cron.schedule(cronExpr, async () => {
      try {
        const current = await reminderRef.get();
        if (!current.exists) return job.stop();
        const data = current.data() as any;
        if (data?.status === "sent" && current.id === reminderRef.id) return job.stop();
        
        const courseTitle = (course.data() as any)?.titulo || "el curso";
        const userName = userData?.nombre || "";

        await resend.emails.send({
          from: "INEE Oficial <contacto@ineeoficial.com>",
          to: email,
          subject: `¿Nos contás tu experiencia en ${courseTitle}?`,
          html: 
            `<div>
              <p>¡Hola ${userName}! Felicitaciones y muchas gracias por completar el curso. ¿Podrías dejarnos una reseña para que otros usuarios puedan conocer tu opinión?</p>
              <a href="${frontendUrl}/course/${courseId}/review?mail=true">Dejar mi reseña</a>
             </div>
            `,
        });

        await reminderRef.update({ status: "sent", sentAt: new Date() });
      } catch (e) {
        console.error("Fallo al enviar email de recordatorio:", e);
        await reminderRef.update({ status: "error", errorAt: new Date(), error: String(e) });
      } finally {
        job.stop(); 
      }
    }, { timezone: process.env.TZ || "America/Argentina/Buenos_Aires" });

    return res.json({
      message: "Recordatorio programado",
      reminderId: reminderRef.id,
      sendAt,
    });

  } catch (error) {
    console.error("Error al enviar recordatorio de review:", error);
    return res.status(500).json({ error: "Error al enviar recordatorio de review" });
  }
};