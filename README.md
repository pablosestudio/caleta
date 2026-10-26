# Espacio Caleta

Sitio web inicial de presentación para Espacio Caleta, Nou Nazareth (San Juan de Alicante).

## Estado actual

Esta primera entrega es una maqueta navegable de la web pública, hecha sin dependencias ni backend:

- Diseño adaptable a móvil y escritorio, basado en el logotipo y las referencias visuales compartidas.
- Secciones para el espacio, talleres, tarifas y consulta de reserva.
- Selector de idioma castellano/inglés.
- Ilustraciones provisionales para representar talleres y el espacio. Se sustituirán por fotografías aprobadas por Caleta.
- Tarifas orientativas transcritas de la imagen facilitada; deben confirmarse antes de publicar.
- El formulario muestra cómo será el flujo, pero no envía ni almacena datos.

## Abrir localmente

Abre `index.html` en un navegador. Las fuentes tipográficas se cargan desde Google Fonts; si no hay conexión se mostrarán fuentes de sistema.

## Siguiente fase

Antes de activar reservas se conectará una base de datos y un backend. El flujo acordado es: la solicitud bloquea provisionalmente la fecha o plazas hasta que Caleta la acepte o rechace; al aceptar, la persona dispone de 24 horas para pagar la señal definida para ese caso; el resto se abona en el evento. Si vence el plazo sin pago, la reserva y disponibilidad deben liberarse.

La fase de backend requiere diseñar y revisar el calendario, prevenir reservas simultáneas, definir importes por solicitud, configurar correo transaccional y pasarela de pago, y proteger el panel con una única cuenta administrativa. No se deben guardar secretos, datos de pago ni datos reales de clientes en el repositorio. Antes de activar el formulario también habrá que completar la información legal y de privacidad de Caleta.

## Publicación

El dominio ya es propiedad de la clienta, pero su configuración y alojamiento se definirán más adelante. Esta versión estática puede servir como primera vista previa; no debe anunciarse como sistema de reservas activo.
