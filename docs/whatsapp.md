# Configurar WhatsApp Business (Meta Cloud API)

La integración usa la **API oficial de WhatsApp Business Platform** de Meta. Mientras no esté lista, los mensajes salen por correo electrónico.

> Importante: el número que conectes a la API **deja de poder usarse en la app de WhatsApp del celular** (o requiere el modo de coexistencia de Meta, si está disponible para tu cuenta). Lo más simple es usar un número nuevo o una línea exclusiva del consultorio.

## 1. Cuenta y número

1. Creá un **Meta Business Portfolio** en https://business.facebook.com (con los datos del consultorio).
2. En https://developers.facebook.com → **Crear app** → tipo **Empresa** → agregá el producto **WhatsApp**.
3. En **WhatsApp → Configuración de la API**: agregá y verificá tu número (por SMS o llamada), y copiá:
   - **Identificador del número de teléfono** → `WHATSAPP_PHONE_NUMBER_ID`
4. Token permanente: en **Configuración del negocio → Usuarios del sistema** creá un usuario del sistema (Administrador), asignale la app y la cuenta de WhatsApp, y generá un token con los permisos `whatsapp_business_messaging` y `whatsapp_business_management` → `WHATSAPP_TOKEN`.
5. **Configuración de la app → Básica → Clave secreta de la app** → `WHATSAPP_APP_SECRET`.
6. Inventá un texto cualquiera para `WHATSAPP_VERIFY_TOKEN`.
7. Agregá un **método de pago** en la cuenta de WhatsApp (Meta cobra por mensaje de plantilla).

Cargá las variables en Vercel y volvé a publicar. En *Integraciones* podés mandar un mensaje de prueba con la plantilla `hello_world`.

## 2. Webhook (estados de entrega)

En la app de Meta → **WhatsApp → Configuración → Webhook**:
- URL de devolución de llamada: `https://<tu-enlace>/api/webhooks/whatsapp`
- Token de verificación: el valor de `WHATSAPP_VERIFY_TOKEN`
- Suscribite al campo **messages**.

Así el panel muestra si cada mensaje fue enviado, entregado, leído o falló.

## 3. Plantillas

Meta exige plantillas aprobadas para los mensajes que inicia la empresa. En el panel → **Mensajes**, cada mensaje muestra el **"Texto para Meta"** listo para copiar. En **WhatsApp Manager → Plantillas de mensajes → Crear**:

| Nombre (exacto) | Categoría | Idioma |
|---|---|---|
| `turno_confirmado` | Utilidad | Español (ARG) `es_AR` |
| `recordatorio_48h` | Utilidad | `es_AR` |
| `recordatorio_24h` | Utilidad | `es_AR` |
| `turno_reprogramado` | Utilidad | `es_AR` |
| `turno_cancelado` | Utilidad | `es_AR` |
| `turno_liberado` | Utilidad | `es_AR` |
| `codigo_verificacion` | Autenticación (con botón "Copiar código") | `es_AR` |

Pegá el texto con las variables `{{1}}`, `{{2}}`… tal cual aparece en el panel y completá los ejemplos que pide Meta. La aprobación suele tardar entre minutos y un día.

- Si cambiás un texto en el panel, también tenés que editarlo en Meta y esperar la nueva aprobación. El orden de las variables tiene que coincidir.
- Si elegiste otro idioma (por ejemplo `es`), cambialo en el campo "Idioma" del panel.

## Qué pasa si algo falla

Cada envío queda registrado (*Mensajes → Últimos envíos*). Los fallos se reintentan automáticamente hasta 5 veces. Los errores más comunes: plantilla no aprobada o con otro nombre, número sin WhatsApp, o falta de método de pago.
