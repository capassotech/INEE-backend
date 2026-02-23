import { Request, Response } from "express";
import { firestore } from '../../config/firebase';
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

    // Obtener el nombre del usuario (si existe en la DB)
    const userSnapshot = await firestore.collection('users').where('email', '==', email).get();
    const userName = !userSnapshot.empty ? userSnapshot.docs[0].data()?.nombre || 'Nombre' : 'Nombre';
    
    // Email enviado al usuario
    await resend.emails.send({
        from: "INEE Oficial <contacto@ineeoficial.com>",
        to: email,
        subject: "¡Te has suscrito a la newsletter de INEE!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
            <p>Hola ${userName},</p>
            
            <p>Tu suscripción a la newsletter de INEE® fue confirmada.</p>
            
            <p>A partir de ahora vas a recibir contenidos vinculados a consultoría, liderazgo y desarrollo emprendedor.</p>
            
            <p>Gracias por formar parte de nuestra comunidad.</p>
            
            <p style="margin-top: 28px; margin-bottom: 4px;"><strong>Equipo INEE®</strong></p>
            
            <div style="margin-top: 30px;">
              <img src="https://firebasestorage.googleapis.com/v0/b/inee-admin.firebasestorage.app/o/Imagenes%2Flogo.png?alt=media&token=e46d276c-06d9-4b52-9d7e-33d85845cbb4" alt="INEE Logo" style="max-width: 150px;" />
            </div>
          </div>
        `,
    });

    // Email enviado a INEE
    await resend.emails.send({
        from: "INEE Oficial <contacto@ineeoficial.com>",
        to: "administracion@ineeoficial.com",
        subject: "¡Nuevo suscriptor a la newsletter de INEE!",
        html: `<p>${email} se ha suscrito a la newsletter de INEE!</p>`,
    });

    return res.json({ message: "Newsletter subscribed" });
};
