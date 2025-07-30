// /src/modules/courses/controller.ts
import { Request, Response } from 'express';
import { firestore } from '../../config/firebase';
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { Course } from './types';

const collection = firestore.collection('courses');

export const getAllCourses = async (_: Request, res: Response) => {
  try {
    const snapshot = await collection.where('visible', '==', true).get();
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
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  try {
    const data: Course = req.body;
    const docRef = await collection.add(data);
    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    console.error('createCourse error:', err);
    return res.status(500).json({ error: 'Error al crear curso' });
  }
};

export const updateCourse = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  try {
    const courseId = req.params.id;
    const data: Partial<Course> = req.body;
    await collection.doc(courseId).update(data);
    return res.json({ success: true });
  } catch (err) {
    console.error('updateCourse error:', err);
    return res.status(500).json({ error: 'Error al actualizar curso' });
  }
};

export const deleteCourse = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  try {
    const courseId = req.params.id;
    await collection.doc(courseId).delete();
    return res.json({ success: true });
  } catch (err) {
    console.error('deleteCourse error:', err);
    return res.status(500).json({ error: 'Error al eliminar curso' });
  }
};