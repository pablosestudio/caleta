# Espacio Caleta

Sitio web inicial de presentación para Espacio Caleta, Nou Nazareth (San Juan de Alicante).

## Estado actual

La web pública es estática y se conecta a Supabase para calendario, contenido y administración:

- Diseño adaptable a móvil y escritorio, basado en el logotipo y las referencias visuales compartidas.
- Secciones para el espacio, talleres, tarifas y consulta de reserva.
- Selector de idioma castellano/inglés.
- Logotipo principal aportado por Caleta en la portada; ilustraciones provisionales para representar los talleres, que se sustituirán por fotografías aprobadas por Caleta.
- Tarifas orientativas transcritas de la imagen facilitada; deben confirmarse antes de publicar.
- El formulario de solicitud sigue en modo demostración y no envía ni almacena datos.
- `/admin.html` contiene inicio de sesión, agenda, edición de talleres y un editor visual del contenido público agrupado por secciones, con vista previa inmediata.
- El panel permite editar contenido en ambos idiomas, SEO, tarifas mostradas, colores, contacto, logotipo e imágenes. Las cuentas adicionales se invitan de forma segura; cada persona define su propia contraseña.
- Las herramientas de equipo y campañas por correo requieren desplegar `supabase/functions/caleta-management`. El envío masivo se mantiene inactivo hasta configurar Resend y publicar un flujo de suscripción y baja con consentimiento.

## Abrir localmente

Abre `index.html` en un navegador. Las fuentes tipográficas se cargan desde Google Fonts; si no hay conexión se mostrarán fuentes de sistema.

## Siguiente fase

Antes de activar reservas se conectará una base de datos y un backend. El flujo acordado es: la solicitud bloquea provisionalmente la fecha o plazas hasta que Caleta la acepte o rechace; al aceptar, la persona dispone de 24 horas para pagar la señal definida para ese caso; el resto se abona en el evento. Si vence el plazo sin pago, la reserva y disponibilidad deben liberarse.

El flujo acordado es: la solicitud mantiene la fecha o las plazas bloqueadas mientras Caleta la revisa; al aceptar, Caleta fija una señal individual y el cliente dispone de 24 horas para pagarla; el resto se abona en el evento. Las migraciones protegen las tablas con RLS, restringen los cambios a cuentas administradoras, impiden solapar solicitudes activas del espacio y comprueban las plazas de talleres bajo bloqueo transaccional.

La solicitud pública y las notificaciones por correo, la generación del enlace de pago, la expiración automática de señales a las 24 horas y la publicación dinámica del resto del contenido se conectarán en la siguiente fase. El formulario no debe activarse para clientes hasta completar esas funciones y publicar la información legal y de privacidad. No se deben guardar secretos, datos de pago ni datos reales de clientes en el repositorio.

Consulta [supabase/SETUP.md](supabase/SETUP.md) para preparar el proyecto de base de datos y la cuenta administradora. Nunca compartas una contraseña por el chat ni la guardes en Git.

## Publicación

El dominio ya es propiedad de la clienta, pero su configuración y alojamiento se definirán más adelante. Esta versión estática puede servir como primera vista previa; no debe anunciarse como sistema de reservas activo.
