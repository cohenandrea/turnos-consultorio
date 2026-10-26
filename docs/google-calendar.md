# Conectar Google Calendar

Una sola vez, unos 15 minutos. Se usa la API oficial de Google Calendar con OAuth (no se comparte tu contraseña).

## 1. Crear las credenciales en Google Cloud

1. Entrá a https://console.cloud.google.com con tu cuenta de Google y creá un proyecto (por ejemplo "Turnos consultorio").
2. **APIs y servicios → Biblioteca** → buscá **Google Calendar API** → **Habilitar**.
3. **APIs y servicios → Pantalla de consentimiento de OAuth** (Google Auth Platform):
   - Tipo: **Externo**. Nombre de la app, tu correo de soporte.
   - Permisos (scopes): `.../auth/calendar.events` y `.../auth/calendar.readonly`.
   - **Publicá la app ("Publicar app" / "In production")**. Si queda en modo "Prueba", Google vence el acceso cada 7 días y la sincronización se corta. Al ser para tu propio uso, no necesitás verificación: cuando conectes vas a ver un aviso de "app no verificada"; tocá *Configuración avanzada → Ir a la app*.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → tipo **Aplicación web**.
   - **URI de redireccionamiento autorizados**: `https://<tu-enlace>/api/google/callback` (exactamente la que muestra el panel en *Integraciones*). Si después usás un dominio propio, agregá también esa URL.
5. Copiá el **ID de cliente** y el **secreto** a Vercel como `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` y volvé a publicar.

## 2. Conectar desde el panel

1. Recomendado: en Google Calendar creá un calendario nuevo llamado "Turnos consultorio".
2. Panel → **Integraciones → Conectar con Google** → elegí tu cuenta y aceptá.
3. Elegí el calendario de turnos. Opcional: marcá otros calendarios (por ejemplo el personal) para que sus eventos también bloqueen horarios.

## Cómo funciona

- **Reserva** → se crea un evento privado "Turno: Nombre Apellido" con cobertura, tipo y un enlace al panel. Nunca se incluyen teléfono, DNI ni datos clínicos. Podés elegir mostrar solo iniciales.
- **Cancelación** → el evento se elimina (o queda marcado "CANCELADO" y libre, según tu preferencia).
- **Reprogramación** → el mismo evento se mueve.
- **Tus eventos** (reuniones, trámites, "No disponible") bloquean esos horarios automáticamente. Los eventos de día completo bloquean el día (por ejemplo "Vacaciones"), aunque Google los marque como "libre". Esto se puede desactivar.
- **Si movés o borrás un evento de turno directamente en Google**, la paciente **no** se entera: el turno aparece en *Inicio → Para revisar*. Lo correcto es reprogramar o cancelar desde el panel, que avisa a la paciente. Opcionalmente, borrar el evento puede cancelar el turno automáticamente (*Integraciones*).
- **Si Google no responde**, el turno se guarda igual, se reintenta automáticamente (hasta 8 veces, con esperas crecientes) y, si no se logra, queda marcado para revisión.
