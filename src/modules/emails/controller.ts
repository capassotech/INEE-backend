import { Request, Response } from "express";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (req: Request, res: Response) => {
    try {
        const { nombre, email, whatsapp } = req.body;

        if (!nombre || !email) {
            return res.status(400).json({ 
                message: "Los campos nombre y email son requeridos" 
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ 
                message: "Formato de email inválido" 
            });
        }

        const { error } = await resend.emails.send({
            from: "INEE Oficial <contacto@ineeoficial.com>",
            to: "administracion@ineeoficial.com",
            subject: `📧 Nuevo Email de ${email} - ${new Date().toLocaleDateString('es-ES')}`,
            text: `Email: ${email}\nTeléfono: ${whatsapp || 'No proporcionado'}\nNombre: ${nombre}`,
        });

        if (error) {
            console.error("Error al enviar email:", error);
            return res.status(500).json({ 
                message: "Error al enviar el email" 
            });
        }

        return res.status(200).json({ 
            success: true,
            message: "Email enviado correctamente" 
        });
    } catch (error) {
        console.error("Error inesperado en sendEmail:", error);
        return res.status(500).json({ 
            message: "Error interno del servidor" 
        });
    }
}