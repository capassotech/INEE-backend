import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { Request, Response } from "express";
import { Event } from "../../types/events";
import { firestore } from "../../config/firebase";
import { validateUser } from "../../utils/utils";

const collection = firestore.collection('events');


export const getAllEvents = async (req: Request, res: Response) => {
    const events = await collection.get();
    return res.json(events.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
};

export const getEventById = async (req: Request, res: Response) => {
    const eventId = req.params.id;
    const event = await collection.doc(eventId).get();
    return res.json({ id: event.id, ...event.data() });
};


export const createEvent= async (req: AuthenticatedRequest, res: Response) => {
    if (!validateUser(req)) return res.status(403).json({ error: 'No autorizado' });

    try {
        const { titulo, descripcion, fecha, hora, modalidad, precio }: Event = req.body;
        if (!titulo || !descripcion || !fecha || !hora || !modalidad || !precio) return res.status(400).json({ error: 'Faltan campos obligatorios' });

        const newEvent: Event = { titulo, descripcion, fecha, hora, modalidad, precio };
        const docRef = await collection.add(newEvent);
        return res
            .status(201)
            .json({
                id: docRef.id,
                ...newEvent
            })
            .end();
    } catch (err) {
        console.error('createEvent error:', err);
        return res.status(500).json({ error: 'Error al crear curso' });
    }
};

export const updateEvent = async (req: AuthenticatedRequest, res: Response) => {
    if (!validateUser(req)) return res.status(403).json({ error: 'No autorizado' });

    try {
        const eventId = req.params.id;
        const data: Partial<Event> = req.body;
        if (!data.titulo && !data.descripcion && !data.fecha && !data.hora && !data.modalidad && !data.precio) return res.status(400).json({ error: 'Faltan campos obligatorios' });

        await collection.doc(eventId).update(data);
        return res.json({
            success: true,
            ...data
        });
    } catch (err) {
        console.error('updateEvent error:', err);
        return res.status(500).json({ error: 'Error al actualizar evento' });
    }
};

export const deleteEvent = async (req: AuthenticatedRequest, res: Response) => {
    if (!validateUser(req)) return res.status(403).json({ error: 'No autorizado' });

    try {
        const eventId = req.params.id;
        await collection.doc(eventId).delete();
        return res.json({ success: true });
    } catch (err) {
        console.error('deleteEvent error:', err);
        return res.status(500).json({ error: 'Error al eliminar evento' });
    }
};
