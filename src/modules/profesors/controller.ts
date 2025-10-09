import { firestore } from "../../config/firebase";
import { Request, Response } from "express";



export const getProfesors = async (req: Request, res: Response) => {
    try {
        const profesors = await firestore.collection('profesores').get();
        res.json(profesors.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
        console.error('getProfesors error:', error);
        res.status(500).json({ error: 'Error al obtener profesores' });
    }
}

export const getProfesorById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const profesor = await firestore.collection('profesores').doc(id).get();
        res.json({ id: profesor.id, ...profesor.data() });
    } catch (error) {
        console.error('getProfesorById error:', error);
        res.status(500).json({ error: 'Error al obtener profesor' });
    }
}