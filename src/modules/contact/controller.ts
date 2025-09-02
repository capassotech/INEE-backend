import { Resend } from "resend";
import { Request, Response } from "express";

const resend = new Resend(process.env.RESEND_API_KEY);

const generateEmailTemplate = (name: string, email: string, message: string, phone: string, type: string) => {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nuevo Mensaje de Contacto - INEE</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f4f4f4;
        }
        
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }
        
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px 20px;
          text-align: center;
        }
        
        .header h1 {
          font-size: 28px;
          margin-bottom: 10px;
          font-weight: 600;
        }
        
        .header p {
          font-size: 16px;
          opacity: 0.9;
        }
        
        .content {
          padding: 40px 30px;
        }
        
        .message-card {
          background: #f8f9fa;
          border-left: 4px solid #667eea;
          padding: 25px;
          margin: 20px 0;
          border-radius: 0 8px 8px 0;
        }
        
        .field {
          margin-bottom: 20px;
        }
        
        .field-label {
          font-weight: 600;
          color: #555;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          display: block;
        }
        
        .field-value {
          background: white;
          padding: 12px 15px;
          border-radius: 6px;
          border: 1px solid #e0e0e0;
          font-size: 16px;
          color: #333;
          word-wrap: break-word;
        }
        
        .message-text {
          min-height: 100px;
          white-space: pre-wrap;
        }
        
        .timestamp {
          background: #e8f2ff;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
          text-align: center;
          font-size: 14px;
          color: #666;
        }
        
        .footer {
          background: #f8f9fa;
          padding: 25px;
          text-align: center;
          border-top: 1px solid #e0e0e0;
        }
        
        .footer p {
          color: #666;
          font-size: 14px;
          margin-bottom: 10px;
        }
        
        .footer a {
          color: #667eea;
          text-decoration: none;
          font-weight: 500;
        }
        
        .footer a:hover {
          text-decoration: underline;
        }
        
        .status-badge {
          display: inline-block;
          background: #28a745;
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        @media only screen and (max-width: 600px) {
          .container {
            margin: 10px;
            border-radius: 0;
          }
          
          .content {
            padding: 20px 15px;
          }
          
          .header {
            padding: 20px 15px;
          }
          
          .header h1 {
            font-size: 24px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <h1>📧 Nuevo Mensaje de Contacto</h1>
          <p>Has recibido un nuevo mensaje a través del formulario de contacto</p>
          <div style="margin-top: 15px;">
            <span class="status-badge">Nuevo Mensaje</span>
          </div>
        </div>
        
        <!-- Content -->
        <div class="content">
          <div class="timestamp">
            <strong>📅 Recibido:</strong> ${new Date().toLocaleString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}
          </div>
          
          <div class="message-card">
            <div class="field">
              <span class="field-label">👤 Nombre Completo</span>
              <div class="field-value">${name}</div>
            </div>
            
            <div class="field">
              <span class="field-label">📧 Email de Contacto</span>
              <div class="field-value">
                <a href="mailto:${email}" style="color: #667eea; text-decoration: none;">${email}</a>
              </div>
            </div>
            
            <div class="field">
              <span class="field-label">💬 Mensaje</span>
              <div class="field-value message-text">${message}</div>
            </div>

            <div class="field">
              <span class="field-label">📱 Teléfono</span>
              <div class="field-value">${phone}</div>
            </div>
            
            <div class="field">
              <span class="field-label">📞 Tipo de Contacto</span>
              <div class="field-value">${type}</div>
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="mailto:${email}?subject=Re: Tu mensaje de contacto - INEE" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 12px 25px; 
                      text-decoration: none; 
                      border-radius: 25px; 
                      font-weight: 600;
                      display: inline-block;
                      transition: transform 0.2s;">
              🔄 Responder Mensaje
            </a>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
          <p><strong>INEE - Instituto Nacional de Educación Empresarial</strong></p>
          <p>Este mensaje fue enviado automáticamente desde el formulario de contacto de tu sitio web.</p>
          <p>
            <a href="https://ineeoficial.com">🌐 Visitar Sitio Web</a> | 
            <a href="mailto:soporte@ineeoficial.com">📧 Soporte Técnico</a>
          </p>
          <p style="margin-top: 15px; font-size: 12px; color: #999;">
            © 2024 INEE. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export const contactSend = async (req: Request, res: Response) => {
  const { name, email, message, phone, type } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: "Todos los campos son requeridos" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Formato de email inválido" });
  }

  const emailTemplate = generateEmailTemplate(name, email, message, phone, type);

  const { error } = await resend.emails.send({
    from: "INEE Oficial <contacto@ineeoficial.com>",
    // to: "administracion@ineeoficial.com",
    to: email,
    replyTo: email,
    subject: `📧 Nuevo Contacto: ${name} - ${new Date().toLocaleDateString('es-ES')}`,
    html: emailTemplate,
  });

  if (error) {
    return res.status(500).json({ message: "Error al enviar el mensaje" });
  }

  return res.status(200).json({
    success: true,
    message: "¡Mensaje enviado exitosamente! Nos pondremos en contacto contigo pronto.",
    timestamp: new Date().toISOString(),
    details: {
      name,
      email,
      sentAt: new Date().toLocaleString('es-ES')
    }
  });
};