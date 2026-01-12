import { Request, Response } from "express";
import { firestore } from "../../config/firebase";



export const getTestimonials = async (req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string || '20'), 100); // Máximo 100
        const lastId = req.query.lastId as string | undefined;
        
        let query = firestore.collection('testimonios')
            .orderBy('__name__') // Ordenar por ID del documento
            .limit(limit);
        
        // Si hay un lastId, continuar desde ahí
        if (lastId) {
            const lastDoc = await firestore.collection('testimonios').doc(lastId).get();
            if (lastDoc.exists) {
                query = query.startAfter(lastDoc);
            }
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            return res.json({
                testimonials: [],
                pagination: {
                    hasMore: false,
                    lastId: null,
                    limit,
                    count: 0
                }
            });
        }
        
        const testimonials = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        const hasMore = snapshot.docs.length === limit;
        
        return res.json({
            testimonials,
            pagination: {
                hasMore,
                lastId: lastDoc?.id,
                limit,
                count: testimonials.length
            }
        });
    } catch (error) {
        console.error('getTestimonials error:', error);
        return res.status(500).json({ error: 'Error al obtener testimonios' });
    }
};

