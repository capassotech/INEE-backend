import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { Request, Response } from "express";
import { Event, ValidatedCreateEvent, ValidatedUpdateEvent } from "../../types/events";
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


export const createEvent = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({ error: "No autorizado. Se requieren permisos de administrador." });
  }

  try {

    const eventData: ValidatedCreateEvent = req.body;

    const newEvent: any = {
      ...eventData,
    };

    // Solo normaliza membresiaId como en updateEvent
    if (newEvent.membresiaId !== undefined) {
      newEvent.membresiaId = newEvent.membresiaId || null;
    }

    const docRef = await collection.add(newEvent);
    const createdDoc = await docRef.get();

    return res.status(201).json({
      id: createdDoc.id,
      ...createdDoc.data(),
      message: "Evento creado exitosamente",
    });
  } catch (err) {
    console.error("createEvent error:", err);
    return res.status(500).json({ error: "Error al crear evento" });
  }
};


export const updateEvent = async (req: AuthenticatedRequest, res: Response) => {
    const isAuthorized = await validateUser(req);
    if (!isAuthorized) {
        return res.status(403).json({
            error: "No autorizado. Se requieren permisos de administrador.",
        });
    }

    try {
        const eventId = req.params.id;
        const updateData: ValidatedUpdateEvent = req.body;

        const eventExists = await collection.doc(eventId).get();
        if (!eventExists.exists) {
            return res.status(404).json({ error: "Evento no encontrado" });
        }

        const dataToUpdate: any = {
            ...updateData,
        };
        if (updateData.membresiaId !== undefined) {
            dataToUpdate.membresiaId = updateData.membresiaId || null;
        }

        await collection.doc(eventId).update(dataToUpdate);
        return res.json({
            message: "Evento actualizado exitosamente",
            id: eventId,
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
