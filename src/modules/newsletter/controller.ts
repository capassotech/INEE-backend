import { Request, Response } from "express";
import { firestore } from '../../config/firebase';



export const getSuscribeUsers = async (req: Request, res: Response) => {
    const suscribeUsers = await firestore.collection('suscripciones_email').get();
    const suscriptions = suscribeUsers.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json(suscriptions);
};


export const subscribeNewsletter = async (req: Request, res: Response) => {
    const { email } = req.body;
    const newDate = new Date();

    if (!email) {
        return res.status(400).json({ message: "Email es requerido" });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Formato de email inválido" });
    }

    const suscribeUser = await firestore.collection('suscripciones_email').where('email', '==', email).get();
    if (suscribeUser.docs.length > 0) {
        return res.status(400).json({ message: "Email ya suscrito" });
    }

    await firestore.collection('suscripciones_email').add({
        email,
        fecha_suscripcion: newDate,
    });

    return res.json({ message: "Newsletter subscribed" });
};
