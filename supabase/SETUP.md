# Preparar el panel seguro de Caleta

La web estática no contiene contraseñas ni una clave privada. Supabase presta la autenticación y la base de datos; las tablas tienen Row Level Security y solo las cuentas registradas como administradoras pueden gestionarlas.

## Configuración inicial

1. Crear un proyecto Supabase para Caleta y guardar sus credenciales en un gestor de contraseñas de la clienta.
2. En Authentication, desactivar el registro público de usuarios. La primera cuenta administradora se crea manualmente; la titular crea nuevos accesos desde el panel seguro.
   Configurar también las URL permitidas de retorno para la URL de GitHub Pages y, más adelante, el dominio definitivo (`/admin.html`), para que funcione el restablecimiento de contraseña.
3. Ejecutar `migrations/202610260001_caleta_admin_calendar.sql` una sola vez en el SQL Editor del proyecto.
4. Ejecutar también `migrations/202610270001_site_content_manager.sql` para habilitar la edición bilingüe del contenido, el almacenamiento de imágenes y la publicación pública segura de talleres.
5. Ejecutar `migrations/202610280001_admin_team_and_newsletter.sql` para permitir invitaciones de más administradores y crear las tablas privadas de consentimiento y campañas.
6. La primera persona administradora se inserta una vez en `public.caleta_admins` usando su UUID de Auth. La migración marca la cuenta más antigua como titular; puede haber varias cuentas de administración, pero debe quedar al menos una.
7. Desplegar `functions/caleta-management` con Supabase CLI. La función requiere autenticación JWT y verifica el rol de la cuenta titular antes de crear o retirar usuarios. `RESEND_API_KEY` y `RESEND_FROM_EMAIL` solo hacen falta para invitaciones por correo y campañas; `CALETA_SITE_URL` configura sus enlaces. Guardar esos valores como secretos de Edge Functions y no subirlos al repositorio ni al HTML.
8. La URL y la clave **publishable** (`sb_publishable_...`) se cargan desde el HTML público. Son valores públicos y solo deben usarse junto con RLS. No copiar en el sitio `sb_secret_...`, `service_role`, contraseñas ni claves de Stripe.
9. Publicar el sitio y abrir `/admin.html`.

## Editor de contenido

Desde la pestaña **Contenido e imágenes** del panel, la persona administradora puede editar las copias públicas en castellano e inglés, SEO, tarifas mostradas, contacto, enlace de Instagram y paleta de color. La edición está dividida por secciones e incluye una vista previa de la web que cambia mientras se escribe. Puede cambiar el logotipo, las imágenes predeterminadas de las tres tarjetas de espacio y las imágenes de los tres talleres destacados; también puede actualizar la imagen de cada taller programado desde su formulario. Al restaurar una imagen de tarjeta vuelve a la imagen predeterminada de Caleta. Los archivos se almacenan en el bucket público `caleta-content` (solo las cuentas administradoras pueden subir, reemplazar o borrar objetos). Los formatos admitidos son JPG, PNG, WebP y AVIF hasta 5 MB.

El panel **Talleres** permite crear, modificar, programar y retirar talleres con imagen. El panel **Equipo** permite a la cuenta titular crear una cuenta con contraseña, o dar acceso a una cuenta de Supabase que ya tenga el correo confirmado. La contraseña solo pasa por la función segura de creación y nunca se guarda en la base de datos de Caleta ni en el repositorio; debe compartirse con la persona por un canal privado. Las invitaciones y campañas por correo siguen necesitando Resend.

La pestaña **Noticias por correo** solo usa suscripciones confirmadas y no incluye automáticamente los correos de las solicitudes de reserva. La suscripción pública, el doble consentimiento y la baja se activarán al conectar el proveedor de correo elegido; no enviar campañas hasta verificar esa integración.

La persona administradora puede solicitar desde `/admin.html` un restablecimiento por correo. Se recomienda exigir contraseñas de al menos 12 caracteres y activar MFA en Supabase antes de guardar datos reales.

## Límites de esta entrega

- Caleta tiene que publicar franjas libres desde el panel para que aparezcan en el calendario público; este solo lee disponibilidad agregada y no recibe datos personales. El formulario público aún no crea solicitudes.
- La aprobación guarda una señal individual y un vencimiento de 24 horas, pero en esta entrega todavía no se manda el correo ni se crea un enlace de pago.
- La liberación automática de solicitudes vencidas requiere configurar un planificador seguro en Supabase; hasta entonces la expiración no debe anunciarse como automática.
- Las tarifas gestionadas en el panel son orientativas; la página pública refleja los cambios guardados en el editor visual.
- Las solicitudes públicas y sus notificaciones, enlaces de pago y expiración automática aún no están conectados. El formulario no debe activarse hasta completar esas funciones y publicar la información legal y de privacidad.
- Antes de aceptar datos reales hay que revisar la base jurídica, el aviso de privacidad, retención/eliminación, textos de cancelación, cookies y proveedor de correo/pago.

Nunca habilitar el formulario real ni añadir una clave secreta al repositorio. Mantener las tablas privadas; solo la función pública de disponibilidad debe devolver datos de agenda sin PII.
