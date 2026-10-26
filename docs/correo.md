# Correo electrónico (SMTP)

Sirve como canal principal mientras WhatsApp no esté configurado, y como copia de la confirmación.

Opciones recomendadas:

- **Resend** (https://resend.com) o **Brevo** (https://brevo.com): verificás tu dominio y obtenés datos SMTP. Es lo más confiable para que los correos no lleguen a spam.
- **Gmail**: activá la verificación en dos pasos y creá una **contraseña de aplicación** (https://myaccount.google.com/apppasswords).
  `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=tu@gmail.com`, `SMTP_PASS=<contraseña de aplicación>`, `EMAIL_FROM="Dra. X <tu@gmail.com>"`. Tiene un límite diario de envíos.

Cargá las variables en Vercel, volvé a publicar y usá **Integraciones → Enviar prueba**.
