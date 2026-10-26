# Espacio Caleta

Sitio web inicial de presentación para Espacio Caleta, Nou Nazareth (San Juan de Alicante).

## Estado actual

Esta primera entrega es una maqueta navegable de la web pública, hecha sin dependencias ni backend:

- Diseño adaptable a móvil y escritorio, basado en el logotipo y las referencias visuales compartidas.
- Secciones para el espacio, talleres, tarifas y consulta de reserva.
- Selector de idioma castellano/inglés.
- Logotipo principal aportado por Caleta en la portada; ilustraciones provisionales para representar los talleres, que se sustituirán por fotografías aprobadas por Caleta.
- Tarifas orientativas transcritas de la imagen facilitada; deben confirmarse antes de publicar.
- El formulario de solicitud sigue en modo demostración y no envía ni almacena datos.
- `/admin.html` contiene el inicio de sesión, el panel privado y la agenda de administración. Caleta publica expresamente cada franja libre; el calendario público solo enseña esas franjas mediante una función segura cuando Supabase está conectado.
- El panel permite gestionar bloqueos, programación de talleres, tarifas orientativas y estados de solicitudes. La conexión requiere un proyecto Supabase privado; las credenciales de pago y de correo todavía no están configuradas.

## Abrir localmente

Abre `index.html` en un navegador. Las fuentes tipográficas se cargan desde Google Fonts; si no hay conexión se mostrarán fuentes de sistema.

## Siguiente fase

Antes de activar reservas se conectará una base de datos y un backend. El flujo acordado es: la solicitud bloquea provisionalmente la fecha o plazas hasta que Caleta la acepte o rechace; al aceptar, la persona dispone de 24 horas para pagar la señal definida para ese caso; el resto se abona en el evento. Si vence el plazo sin pago, la reserva y disponibilidad deben liberarse.

El flujo acordado es: la solicitud mantiene la fecha o las plazas bloqueadas mientras Caleta la revisa; al aceptar, Caleta fija una señal individual y el cliente dispone de 24 horas para pagarla; el resto se abona en el evento. La migración protege las tablas con RLS, restringe el panel a una única cuenta, impide solapar solicitudes activas del espacio y comprueba las plazas de talleres bajo bloqueo transaccional.

La solicitud pública y las notificaciones por correo, la generación del enlace de pago, la expiración automática de señales a las 24 horas y la publicación dinámica del resto del contenido se conectarán en la siguiente fase. El formulario no debe activarse para clientes hasta completar esas funciones y publicar la información legal y de privacidad. No se deben guardar secretos, datos de pago ni datos reales de clientes en el repositorio.

Consulta [supabase/SETUP.md](supabase/SETUP.md) para preparar el proyecto de base de datos y la cuenta administradora. Nunca compartas una contraseña por el chat ni la guardes en Git.

## Publicación

El dominio ya es propiedad de la clienta, pero su configuración y alojamiento se definirán más adelante. Esta versión estática puede servir como primera vista previa; no debe anunciarse como sistema de reservas activo.
