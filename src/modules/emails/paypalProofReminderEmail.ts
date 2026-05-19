import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendPaypalProofReminderEmailParams {
  userName: string;
  userEmail: string;
  orderNumber: string;
  uploadUrl: string;
  proofEmail: string;
}

export const sendPaypalProofReminderEmail = async ({
  userName,
  userEmail,
  orderNumber,
  uploadUrl,
  proofEmail,
}: SendPaypalProofReminderEmailParams): Promise<void> => {
  const subject = `Recordatorio: cargá tu comprobante de PayPal - Orden ${orderNumber}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
      <p>Hola ${userName || 'estudiante'},</p>

      <p>Detectamos que iniciaste una compra con <strong>PayPal</strong> (orden <strong>${orderNumber}</strong>), pero todavía no recibimos el comprobante de pago.</p>

      <p>Para que podamos validar tu compra y habilitar el acceso a tus contenidos, necesitamos que nos envíes el comprobante de una de estas formas:</p>

      <ol style="padding-left: 20px;">
        <li style="margin-bottom: 10px;">
          <strong>Cargarlo en la plataforma:</strong>
          <a href="${uploadUrl}" style="color: #1a73e8; text-decoration: none;">hacé clic acá para subir tu comprobante</a>
        </li>
        <li>
          <strong>Enviarlo por email:</strong> respondé a este correo adjuntando el comprobante o envialo a
          <a href="mailto:${proofEmail}" style="color: #1a73e8; text-decoration: none;">${proofEmail}</a>
          indicando tu número de orden (<strong>${orderNumber}</strong>).
        </li>
      </ol>

      <p style="margin-top: 24px;">Si ya enviaste el comprobante, podés ignorar este mensaje. Lo revisaremos a la brevedad.</p>

      <p style="margin-top: 28px; margin-bottom: 4px;"><strong>Equipo INEE®</strong></p>

      <div style="margin-top: 30px;">
        <img src="https://firebasestorage.googleapis.com/v0/b/inee-admin.firebasestorage.app/o/Imagenes%2Flogo.png?alt=media&token=e46d276c-06d9-4b52-9d7e-33d85845cbb4" alt="INEE Logo" style="max-width: 150px;" />
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: 'INEE Oficial <contacto@ineeoficial.com>',
    to: userEmail,
    replyTo: proofEmail,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Error al enviar email de recordatorio PayPal: ${JSON.stringify(error)}`);
  }
};
