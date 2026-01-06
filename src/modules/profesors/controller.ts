import { firestore } from "../../config/firebase";
import { Request, Response } from "express";



export const getProfesors = async (req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string || '20'), 100); // Máximo 100
        const lastId = req.query.lastId as string | undefined;
        
        // Consultar limit + 1 para saber si hay más documentos
        const extendedQuery = lastId 
            ? firestore.collection('profesores').orderBy('__name__').startAfter(await firestore.collection('profesores').doc(lastId).get()).limit(limit + 1)
            : firestore.collection('profesores').orderBy('__name__').limit(limit + 1);
        
        const snapshot = await extendedQuery.get();
        
        if (snapshot.empty) {
            return res.json({
                profesors: [],
                pagination: {
                    hasMore: false,
                    lastId: null,
                    limit,
                    count: 0
                }
            });
        }
        
        // Tomar solo los primeros 'limit' documentos
        const docs = snapshot.docs.slice(0, limit);
        const profesors = docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));
        
        const lastDoc = docs[docs.length - 1];
        // Si hay más documentos que el límite, entonces hay más páginas
        const hasMore = snapshot.docs.length > limit;
        
        return res.json({
            profesors,
            pagination: {
                hasMore,
                lastId: lastDoc?.id,
                limit,
                count: profesors.length
            }
        });
    } catch (error) {
        console.error('getProfesors error:', error);
        return res.status(500).json({ error: 'Error al obtener profesores' });
    }
}

export const getProfesorById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const profesor = await firestore.collection('profesores').doc(id).get();
        if (!profesor.exists) {
            return res.status(404).json({ error: 'Profesor no encontrado' });
        }
        res.json({ id: profesor.id, ...profesor.data() });
    } catch (error) {
        console.error('getProfesorById error:', error);
        res.status(500).json({ error: 'Error al obtener profesor' });
    }
}

export const createProfesor = async (req: Request, res: Response) => {
    try {
        const { nombre, apellido, photo_url } = req.body;
        
        if (!nombre || !apellido) {
            return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
        }
        
        const profesorData = {
            nombre,
            apellido,
            photo_url: photo_url || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        
        const docRef = await firestore.collection('profesores').add(profesorData);
        const newProfesor = await docRef.get();
        
        res.status(201).json({ id: newProfesor.id, ...newProfesor.data() });
    } catch (error) {
        console.error('createProfesor error:', error);
        res.status(500).json({ error: 'Error al crear profesor' });
    }
}

export const updateProfesor = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, photo_url } = req.body;
        
        const profesorRef = firestore.collection('profesores').doc(id);
        const profesorDoc = await profesorRef.get();
        
        if (!profesorDoc.exists) {
            return res.status(404).json({ error: 'Profesor no encontrado' });
        }
        
        const updateData: any = {
            updatedAt: new Date().toISOString(),
        };
        
        if (nombre !== undefined) updateData.nombre = nombre;
        if (apellido !== undefined) updateData.apellido = apellido;
        if (photo_url !== undefined) updateData.photo_url = photo_url;
        
        await profesorRef.update(updateData);
        const updatedProfesor = await profesorRef.get();
        
        res.json({ id: updatedProfesor.id, ...updatedProfesor.data() });
    } catch (error) {
        console.error('updateProfesor error:', error);
        res.status(500).json({ error: 'Error al actualizar profesor' });
    }
}

export const deleteProfesor = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const profesorRef = firestore.collection('profesores').doc(id);
        const profesorDoc = await profesorRef.get();
        
        if (!profesorDoc.exists) {
            return res.status(404).json({ error: 'Profesor no encontrado' });
        }
        
        await profesorRef.delete();
        res.json({ message: 'Profesor eliminado correctamente' });
    } catch (error) {
        console.error('deleteProfesor error:', error);
        res.status(500).json({ error: 'Error al eliminar profesor' });
    }
}