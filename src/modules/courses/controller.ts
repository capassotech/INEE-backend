// /src/modules/courses/controller.ts
import { Request, Response } from 'express';
import { firestore } from '../../config/firebase';
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { Course } from '../../types/courses';

const collection = firestore.collection('courses');

export const getAllCourses = async (_: Request, res: Response) => {
  try {
    const snapshot = await collection.get();
    const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json(courses);
  } catch (err) {
    console.error('getAllCourses error:', err);
    return res.status(500).json({ error: 'Error al obtener cursos' });
  }
};

export const getCourseById = async (req: Request, res: Response) => {
  try {
    const courseId = req.params.id;
    const doc = await collection.doc(courseId).get();

    if (!doc.exists) return res.status(404).json({ error: 'Curso no encontrado' });

    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('getCourseById error:', err);
    return res.status(500).json({ error: 'Error al obtener curso' });
  }
};

export const createCourse = async (req: AuthenticatedRequest, res: Response) => {
  if (!validateUser(req)) return res.status(403).json({ error: 'No autorizado' });

  try {
    const { titulo, descripcion, duracion, pilar, precio, nivel, modalidad } : Course = req.body;
    if (!titulo || !descripcion || !duracion || !pilar || !precio || !nivel || !modalidad) return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const newCourse: Course = { titulo, descripcion, duracion, pilar, precio, nivel, modalidad };
    const docRef = await collection.add(newCourse);
    return res
      .status(201)
      .json({ 
        id: docRef.id,
        ...newCourse
      })
      .end();
  } catch (err) {
    console.error('createCourse error:', err);
    return res.status(500).json({ error: 'Error al crear curso' });
  }
};

export const updateCourse = async (req: AuthenticatedRequest, res: Response) => {
  if (!validateUser(req)) return res.status(403).json({ error: 'No autorizado' });

  try {
    const courseId = req.params.id;
    const data: Partial<Course> = req.body;
    if (!data.titulo && !data.descripcion && !data.duracion && !data.pilar && !data.precio && !data.nivel && !data.modalidad) return res.status(400).json({ error: 'Faltan campos obligatorios' });

    await collection.doc(courseId).update(data);
    return res.json({ 
      success: true,
      ...data
    });
  } catch (err) {
    console.error('updateCourse error:', err);
    return res.status(500).json({ error: 'Error al actualizar curso' });
  }
};

export const deleteCourse = async (req: AuthenticatedRequest, res: Response) => {
  if (!validateUser(req)) return res.status(403).json({ error: 'No autorizado' });

  try {
    const courseId = req.params.id;
    await collection.doc(courseId).delete();
    return res.json({ success: true });
  } catch (err) {
    console.error('deleteCourse error:', err);
    return res.status(500).json({ error: 'Error al eliminar curso' });
  }
};


const validateUser = async (req: AuthenticatedRequest) => {
  const userEmail = req.user.email;
  if (!userEmail) return false;
  const userDoc = await firestore.collection('users').doc(userEmail).get();
  const userData = userDoc.data();
  return userData?.role === 'admin';
}