import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { ValidatedCourse, ValidatedUpdateCourse } from "../../types/courses";

const collection = firestore.collection("courses");

export const getAllCourses = async (_: Request, res: Response) => {
  try {
    const snapshot = await collection.get();

    if (snapshot.empty) {
      return res.json([]);
    }

    const courses = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(courses);
  } catch (err) {
    console.error("getAllCourses error:", err);
    return res.status(500).json({ error: "Error al obtener cursos" });
  }
};

export const getCourseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await collection.doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("getCourseById error:", err);
    return res.status(500).json({ error: "Error al obtener curso" });
  }
};

export const createCourse = async (
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
    const courseData: ValidatedCourse = req.body;

    const profesorExists = await firestore
      .collection("profesores")
      .doc(courseData.id_profesor)
      .get();
    if (!profesorExists.exists) {
      return res
        .status(404)
        .json({ error: "El profesor especificado no existe" });
    }

    for (const moduloId of courseData.id_modulos) {
      const moduloExists = await firestore
        .collection("modulos")
        .doc(moduloId)
        .get();
      if (!moduloExists.exists) {
        return res.status(404).json({
          error: `El módulo con ID "${moduloId}" no existe`,
        });
      }
    }

    const docRef = await collection.add({ ...courseData });

    return res.status(201).json({
      id: docRef.id,
      message: "Curso creado exitosamente",
      ...courseData,
    });
  } catch (err) {
    console.error("createCourse error:", err);
    return res.status(500).json({ error: "Error al crear curso" });
  }
};

export const updateCourse = async (
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
    const updateData: ValidatedUpdateCourse = req.body;

    const courseExists = await collection.doc(id).get();
    if (!courseExists.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    if (updateData.id_profesor) {
      const profesorExists = await firestore
        .collection("profesores")
        .doc(updateData.id_profesor)
        .get();
      if (!profesorExists.exists) {
        return res
          .status(404)
          .json({ error: "El profesor especificado no existe" });
      }
    }

    if (updateData.id_modulos) {
      for (const moduloId of updateData.id_modulos) {
        const moduloExists = await firestore
          .collection("modulos")
          .doc(moduloId)
          .get();
        if (!moduloExists.exists) {
          return res.status(404).json({
            error: `El módulo con ID "${moduloId}" no existe`,
          });
        }
      }
    }

    await collection.doc(id).update({ ...updateData });

    return res.json({
      message: "Curso actualizado exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("updateCourse error:", err);
    return res.status(500).json({ error: "Error al actualizar curso" });
  }
};

export const deleteCourse = async (
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

    const courseExists = await collection.doc(id).get();
    if (!courseExists.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    await collection.doc(id).delete();
    return res.json({
      message: "Curso eliminado exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("deleteCourse error:", err);
    return res.status(500).json({ error: "Error al eliminar curso" });
  }
};

const validateUser = async (req: AuthenticatedRequest) => {
  const userId = req.user.uid;
  console.log("User email:", userId);
  if (!userId) return false;
  const userDoc = await firestore.collection("users").doc(userId).get();
  const userData = userDoc.data();
  console.log("User data:", userData);
  return userData?.role === "admin";
};
