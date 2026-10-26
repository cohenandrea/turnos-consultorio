# Seguridad, privacidad y copias de seguridad

## Medidas implementadas
- **Sin reservas duplicadas**: la base de datos tiene una restricción de exclusión (`EXCLUDE USING gist`) que impide que dos turnos confirmados se superpongan, incluso si dos personas confirman en el mismo instante. Probado con 10 reservas simultáneas.
- **Operaciones transaccionales**: reservar, cancelar y reprogramar se hacen en una única transacción junto con los recordatorios. Si una reprogramación falla, el turno original queda intacto.
- **Enlaces de gestión**: 256 bits aleatorios; en la base se guarda solo el hash (y una copia cifrada para poder reenviarlo). No contienen datos personales. Son revocables desde el panel. La página no envía el enlace como "referrer" a otros sitios y no se indexa en buscadores.
- **Recuperación de datos**: solo con un código de 6 dígitos enviado al contacto registrado, válido por 10 minutos y con un máximo de 5 intentos. La respuesta es idéntica exista o no la paciente.
- **Panel**: contraseñas con bcrypt, sesión firmada de 12 horas en una cookie `HttpOnly`, roles (Profesional / Secretaría), verificación de permisos en cada página y acción, cierre de otras sesiones al cambiar la contraseña, límite de intentos de ingreso.
- **Credenciales de Google** cifradas con AES-256-GCM (`ENCRYPTION_KEY`).
- **Límite de solicitudes** para reservas, códigos, reenvíos y lista de espera, y un campo trampa contra bots.
- **Encabezados de seguridad**: HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Todo el tráfico va por HTTPS (Vercel).
- **Registro de cambios** de las acciones importantes, sin datos personales en el detalle.
- **Minimización**: no se guardan datos clínicos ni motivos de consulta. Google Calendar recibe solo nombre, cobertura y tipo de consulta.

## Ley 25.326 – a tener en cuenta
- Completá en **Configuración** el nombre del responsable de la base de datos; la política de privacidad (`/privacidad`) se arma con esos datos. Hacela revisar por tu asesor legal.
- Evaluá la **inscripción de la base de datos** en el Registro Nacional de Bases de Datos de la Agencia de Acceso a la Información Pública (AAIP).
- **Derecho de supresión**: Pacientes → (paciente) → *Suprimir datos personales*.
- **Consentimiento**: la aceptación de la política es obligatoria para reservar; los recordatorios requieren una autorización aparte (casilla sin marcar por defecto). Ambas quedan registradas con fecha.
- Los proveedores (Vercel, Supabase, Meta, Google) procesan datos fuera del país: mencionado en la política de privacidad.

## Copias de seguridad y recuperación
1. **Supabase Pro** hace copias diarias automáticas, restaurables desde su panel.
2. **Copia propia cifrada** (incluida): `.github/workflows/backup.yml` hace un volcado diario, lo cifra y lo guarda 30 días en GitHub. Necesita los secrets `DATABASE_URL_DIRECT` y `BACKUP_PASSPHRASE` (guardá la frase en un lugar seguro: sin ella la copia no se puede abrir).
   Para restaurar: `gpg -d backup.sql.gz.gpg | gunzip | psql "<cadena de conexión>"`.
3. **Exportación manual**: Pacientes → *Exportar CSV* (perfil Profesional).

Si se pierde la aplicación pero no la base, alcanza con volver a publicar el código con las mismas variables de entorno (en especial la misma `ENCRYPTION_KEY`).
