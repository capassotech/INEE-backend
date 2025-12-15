import { Request, Response } from "express";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (req: Request, res: Response) => {
    console.log("Recibido");
    const { nombre, email, whatsapp } = req.body;
    console.log(nombre, email, whatsapp);


    await resend.emails.send({
        from: "INEE Oficial <contacto@ineeoficial.com>",
        to: "administracion@ineeoficial.com",
        subject: `📧 Nuevo Email de ${email} - ${new Date().toLocaleDateString('es-ES')}`,
        text: `Email: ${email}\nTeléfono: ${whatsapp}\nNombre: ${nombre}`,
    });

    return res.status(200).json({ message: "Email enviado correctamente" });
}