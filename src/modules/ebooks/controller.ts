import { firestore } from "../../config/firebase";
import { Request, Response } from "express";
import { ValidatedCreateEbook, ValidatedUpdateEbook } from "../../types/ebooks";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";



export const getEbooks = async (_: Request, res: Response) => {
    try {
        const ebooksSnapshot = await firestore.collection('ebooks').get();
        const ebooks = ebooksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        return res.json(ebooks);
    } catch (error) {
        console.error('getEbooks error:', error);
        return res.status(500).json({ error: 'Error al obtener ebooks' });
    }
};

export const getEbookById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const ebookDoc = await firestore.collection('ebooks').doc(id).get();

        if (!ebookDoc.exists) {
            return res.status(404).json({ error: 'Ebook no encontrado' });
        }

        return res.json({
            id: ebookDoc.id,        
            ...ebookDoc.data()     
        });
    } catch (error) {
        console.error('getEbookById error:', error);
        return res.status(500).json({ error: 'Error al obtener ebook' });
    }
};


export const createEbook = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const isAuthorized = await validateUser(req);
        if (!isAuthorized) return res.status(403).json({ error: 'No autorizado' });

        const { title, description, author, price, estado, pilares, archivoUrl, temas, tags }: ValidatedCreateEbook = req.body;

        const ebook = await firestore.collection('ebooks').add({ title, description, author, price, estado, pilares, archivoUrl, temas, tags });
        return res.json(ebook);
    } catch (error) {
        console.error('createEbook error:', error);
        return res.status(500).json({ error: 'Error al crear ebook' });
    }
};

export const updateEbook = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const isAuthorized = await validateUser(req);
        if (!isAuthorized) return res.status(403).json({ error: 'No autorizado' });

        const { id } = req.params;
        const { title, description, author, price, estado, pilares, archivoUrl, temas, tags }: ValidatedUpdateEbook = req.body;

        const ebook = await firestore.collection('ebooks').doc(id).update({ title, description, author, price, estado, pilares, archivoUrl, temas, tags });
        return res.json(ebook);
    } catch (error) {
        console.error('updateEbook error:', error);
        return res.status(500).json({ error: 'Error al actualizar ebook' });
    }
};

export const deleteEbook = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const isAuthorized = await validateUser(req);
        if (!isAuthorized) return res.status(403).json({ error: 'No autorizado' });

        const { id } = req.params;
        await firestore.collection('ebooks').doc(id).delete();
        return res.json({ message: 'Ebook deleted successfully' });
    } catch (error) {
        console.error('deleteEbook error:', error);
        return res.status(500).json({ error: 'Error al eliminar ebook' });
    }
};