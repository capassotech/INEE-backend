import { Request, Response } from "express";
import { firestore } from "../../config/firebase";



export const getTestimonials = async (req: Request, res: Response) => {
    try {
        const testimonials = await firestore.collection('testimonios').get();
        return res.json(testimonials.docs.map(doc => doc.data()));
    } catch (error) {
        console.error('getTestimonials error:', error);
        return res.status(500).json({ error: 'Error al obtener testimonios' });
    }
};

