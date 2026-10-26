# Turnos online para consultorio médico

Plataforma de autogestión de turnos: las pacientes reservan, confirman, reprograman o cancelan desde el celular, con sugerencia automática de tres horarios, coberturas configurables, sincronización con Google Calendar y recordatorios por WhatsApp o correo.

## Qué incluye

| Área | Funcionalidad |
|---|---|
| Página pública | Presentación, dirección, coberturas, botón de WhatsApp, reserva en 3 pasos (cobertura → turno → datos) |
| Disponibilidad | 3 sugerencias (la más próxima + alternativas en otros días y franjas), calendario "ver más", feriados, vacaciones, bloqueos, horarios especiales, duración por tipo/cobertura, tiempo entre pacientes, anticipación mínima y máxima |
| Coberturas | Alta/baja/edición, reglas por cobertura (tipos, días, horario, sedes, duración, datos requeridos, instrucciones), enlace `?cobertura=osde` y QR para cartillas |
| Pacientes | Formulario adaptado a la cobertura, validaciones, recuperación de datos con código (correo/WhatsApp), consentimiento |
| Autogestión | Enlace personal y revocable: confirmar asistencia, reprogramar (el turno original se conserva hasta confirmar), cancelar con confirmación y oferta inmediata de 3 nuevos turnos |
| Google Calendar | OAuth, elección de calendario, creación/actualización/borrado de eventos, eventos propios bloquean horarios, detección de cambios hechos en Google, reintentos automáticos |
| Mensajes | WhatsApp Cloud API (plantillas) y correo SMTP; confirmación, 48 h, 24 h, reprogramación, cancelación, lista de espera; sin duplicados, con reintentos y registro de estado |
| Lista de espera | Aviso automático a pacientes compatibles cuando se libera un turno |
| Panel privado | Inicio con indicadores, lista y calendario semanal, alta manual y sobreturnos, bloqueos, agenda, coberturas, mensajes, pacientes, usuarios con roles, registro de cambios, exportación CSV |
| Seguridad | Restricción de base de datos contra superposición de turnos, sesiones firmadas, roles, límites de intentos, tokens solo con hash, credenciales cifradas, encabezados de seguridad, política de privacidad (Ley 25.326), supresión de datos |

## Tecnología

Next.js 15 (React 19) · Tailwind CSS 4 · PostgreSQL (Supabase/Neon) con Drizzle ORM · Luxon (zona `America/Argentina/Buenos_Aires`) · Vercel.

## Probar en tu computadora

Requisitos: Node.js 20+ y PostgreSQL (o una base gratuita de Supabase/Neon).

```bash
npm install
cp .env.example .env.local     # completá DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, ADMIN_*
npm run db:migrate             # crea las tablas y carga datos de ejemplo editables
npm run dev                    # http://localhost:3000  ·  panel: http://localhost:3000/admin
```

Pruebas automáticas (necesitan una base de pruebas; por defecto `postgres://postgres:postgres@localhost:5432/turnos_test`, o definí `TEST_DATABASE_URL`):

```bash
npm test
```

Cubren el motor de disponibilidad, sugerencias, recordatorios, **reservas simultáneas**, superposiciones, cancelación, reprogramación (incluido el fallo que debe conservar el turno original), reintentos de mensajes, fallos y reconciliación de Google Calendar, y la recuperación de datos con código.

## Guías

- [Puesta en marcha y publicación](docs/puesta-en-marcha.md)
- [Conectar Google Calendar](docs/google-calendar.md)
- [Configurar WhatsApp Business](docs/whatsapp.md)
- [Correo electrónico](docs/correo.md)
- [Uso diario: horarios, prepagas y cartillas](docs/uso-diario.md)
- [Seguridad, privacidad y copias de seguridad](docs/seguridad.md)

## Estructura

```
src/lib/availability.ts          motor de disponibilidad (funciones puras)
src/lib/services/booking.ts      reservar / cancelar / reprogramar (transaccional)
src/lib/google/                  OAuth, API y sincronización con Google Calendar
src/lib/messaging/               WhatsApp, correo y bandeja de salida con reintentos
src/app/reservar, src/app/t      páginas públicas
src/app/admin                    panel privado
drizzle/                         migraciones (incluye la restricción anti-superposición)
tests/                           pruebas
```
