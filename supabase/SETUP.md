# Preparar el panel seguro de Caleta

La web estática no contiene contraseñas ni una clave privada. Supabase presta la autenticación y la base de datos; las tablas tienen Row Level Security y solo una cuenta registrada como administradora puede consultarlas o modificarlas.

## Configuración inicial

1. Crear un proyecto Supabase para Caleta y guardar sus credenciales en un gestor de contraseñas de la clienta.
2. En Authentication, desactivar el registro público de usuarios. La administración tendrá una sola cuenta, creada/invitada manualmente desde el panel de Supabase.
   Configurar también las URL permitidas de retorno para la URL de GitHub Pages y, más adelante, el dominio definitivo (`/admin.html`), para que funcione el restablecimiento de contraseña.
3. Ejecutar `migrations/202610260001_caleta_admin_calendar.sql` una sola vez en el SQL Editor del proyecto.
4. Crear o invitar la cuenta de administración. Copiar su UUID de `auth.users` e insertar en SQL Editor: `insert into public.caleta_admins (user_id) values ('UUID-DE-LA-CUENTA');`. El índice impide registrar una segunda cuenta administradora.
5. Copiar la URL del proyecto y la clave **publishable** (`sb_publishable_...`) en `assets/supabase-config.js`. Esos dos valores son públicos y solo se usan junto con RLS. No copiar aquí `sb_secret_...`, `service_role`, contraseñas ni claves de Stripe.
6. Publicar el sitio y abrir `/admin.html`. Verificar el inicio de sesión y que las vistas sin sesión no puedan consultar datos privados.

La persona administradora puede solicitar desde `/admin.html` un restablecimiento por correo. Se recomienda exigir contraseñas de al menos 12 caracteres y activar MFA en Supabase antes de guardar datos reales.

## Límites de esta entrega

- Caleta tiene que publicar franjas libres desde el panel para que aparezcan en el calendario público; este solo lee disponibilidad agregada y no recibe datos personales. El formulario público aún no crea solicitudes.
- La aprobación guarda una señal individual y un vencimiento de 24 horas, pero en esta entrega todavía no se manda el correo ni se crea un enlace de pago.
- La liberación automática de solicitudes vencidas requiere configurar un planificador seguro en Supabase; hasta entonces la expiración no debe anunciarse como automática.
- Las tarifas gestionadas en el panel son orientativas. La web pública aún tiene el contenido estático inicial y no refleja automáticamente las ediciones del panel.
- Antes de aceptar datos reales hay que revisar la base jurídica, el aviso de privacidad, retención/eliminación, textos de cancelación, cookies y proveedor de correo/pago.

Nunca habilitar el formulario real ni añadir una clave secreta al repositorio. Mantener las tablas privadas; solo la función pública de disponibilidad debe devolver datos de agenda sin PII.
