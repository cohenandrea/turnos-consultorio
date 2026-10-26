# Puesta en marcha

Tiempo estimado: 1 hora la primera vez. No hace falta programar.

## 1. Base de datos (Supabase)

1. Creá una cuenta en https://supabase.com y un proyecto nuevo. Región sugerida: **São Paulo (sa-east-1)**, la más cercana a Argentina.
2. Guardá la contraseña de la base.
3. En **Project Settings → Database → Connection string**, copiá:
   - **Transaction pooler** (puerto 6543) → será `DATABASE_URL`.
   - **Direct connection** (puerto 5432) → la usa la copia de seguridad (`DATABASE_URL_DIRECT`).

> Alternativa equivalente: Neon (https://neon.tech).

## 2. Código en GitHub

Subí esta carpeta a un repositorio **privado** de GitHub.

## 3. Publicar en Vercel

1. Entrá a https://vercel.com con tu cuenta de GitHub → **Add New → Project** → elegí el repositorio.
2. En **Environment Variables** cargá las de `.env.example`. Como mínimo:
   - `DATABASE_URL`, `APP_URL` (por ahora `https://<nombre-del-proyecto>.vercel.app`)
   - `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`: textos largos al azar. Podés generarlos en https://generate-secret.vercel.app/48 (uno distinto para cada uno).
   - `ADMIN_EMAIL` y `ADMIN_INITIAL_PASSWORD` (mínimo 10 caracteres).
3. **Deploy**. Durante la publicación se crean las tablas y los datos de ejemplo automáticamente.
4. **Ese es tu enlace público**: `https://<nombre-del-proyecto>.vercel.app`. Ya lo podés abrir en el celular.

> ⚠️ Nunca cambies `ENCRYPTION_KEY` después de empezar a usar el sistema: es la clave con la que se guardan cifrados el acceso a Google y los enlaces de las pacientes.

## 4. Primer ingreso al panel

Abrí `https://<tu-enlace>/admin` e ingresá con `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD`. Después, en **Usuarios**, cambiá la contraseña.

Cargá en este orden:
1. **Configuración**: nombre, especialidad, foto, WhatsApp de contacto, colores, responsable de datos.
2. **Horarios y agenda**: sedes, días y horarios, duración de consultas, reglas.
3. **Coberturas**: activá las que aceptás, desactivá las otras.
4. **Bloqueos y feriados**: importá los feriados del año y cargá tus vacaciones.

## 5. Tarea programada (recordatorios)

La aplicación necesita que alguien la "despierte" cada 5–10 minutos para enviar recordatorios, reintentar envíos fallidos y leer cambios de Google Calendar. Elegí **una** opción:

- **GitHub Actions (gratis, incluido):** en el repositorio → *Settings → Secrets and variables → Actions*, creá `APP_URL` y `CRON_SECRET`. El archivo `.github/workflows/cron.yml` ya está listo. (GitHub puede demorar algunos minutos los horarios; para recordatorios de 24/48 h no es un problema.)
- **cron-job.org (gratis):** creá una tarea cada 5 minutos a `https://<tu-enlace>/api/cron` con el encabezado `Authorization: Bearer <CRON_SECRET>`.
- **Vercel Pro:** cambiá el horario de `vercel.json` a `*/10 * * * *`.

`vercel.json` ya incluye una ejecución diaria de respaldo. En **Integraciones → Tarea programada** del panel ves si está funcionando.

## 6. Dominio propio (opcional)

1. Registrá el dominio (por ejemplo, en https://nic.ar para `.com.ar`).
2. En Vercel → *Settings → Domains* agregá `turnos.tudominio.com.ar` y creá en tu proveedor de DNS el registro **CNAME** que Vercel te indique.
3. Actualizá `APP_URL` con el dominio nuevo y volvé a publicar (*Deployments → Redeploy*). Si usás Google Calendar, agregá también la nueva URL de redirección en Google Cloud (ver guía).

## 7. Integraciones

- [Google Calendar](google-calendar.md)
- [WhatsApp Business](whatsapp.md)
- [Correo electrónico](correo.md): recomendable configurarlo primero, porque es la alternativa mientras WhatsApp no esté aprobado.

## Costos mensuales estimados

| Servicio | Costo | Comentario |
|---|---|---|
| Vercel | US$ 0 (Hobby) / US$ 20 (Pro) | El plan gratuito es para uso no comercial; para un consultorio corresponde Pro |
| Supabase | US$ 0 (Free) / US$ 25 (Pro) | Pro incluye copias de seguridad diarias automáticas |
| Google Calendar API | Gratis | |
| WhatsApp (Meta) | Por mensaje | Las plantillas de "utilidad" (confirmaciones, recordatorios) se cobran por mensaje enviado; consultá la tarifa vigente para Argentina en https://developers.facebook.com/docs/whatsapp/pricing |
| Correo (Resend / Brevo / Gmail) | Gratis en volúmenes bajos | |
| Dominio `.com.ar` | Arancel anual de NIC Argentina | Opcional |
| GitHub | Gratis | Repositorio privado, tareas programadas y backups |

Los precios cambian: verificalos antes de contratar.
