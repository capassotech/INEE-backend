import { Resend } from "resend";
import { Request, Response } from "express";

const resend = new Resend(process.env.RESEND_API_KEY);

export const contactSend = async (req: Request, res: Response) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: "Todos los campos son requeridos" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Formato de email inválido" });
  }

  // Cambiar el email de from por el dominio ingresado en Resend 
  const { error } = await resend.emails.send({
    from: "Contact <onboarding@resend.dev>",
    to: "fede.juan.herrera@gmail.com",
    subject: "Nuevo mensaje de contacto",
    html: `<p>Nombre: ${name}</p><p>Email: ${email}</p><p>Mensaje: ${message}</p>`,
  });

  if (error) {
    return res.status(500).json({ message: "Error al enviar el mensaje" });
  }  
  
  return res.json({ message: "Message sent" });
};