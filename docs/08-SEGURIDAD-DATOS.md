# Seguridad de datos de GlutenGo

Documento operativo interno. No es una certificacion legal externa; es la base de controles tecnicos y criterios de manejo de datos para operar GlutenGo con menos riesgo.

## Controles activos

- Alta de locales protegida por Google OAuth: una solicitud solo se guarda si el usuario entra con una cuenta Google verificada.
- El backend ignora emails escritos libremente para solicitudes nuevas y guarda el email verificado del token de Google.
- Las solicitudes quedan pendientes hasta revision manual desde admin.
- Los cambios enviados desde "Mi local" requieren login con Google y quedan pendientes de aprobacion.
- Las metricas propias son anonimas: no guardan IP, nombre, email ni usuario autenticado.
- Las funciones usan `SUPABASE_SERVICE_ROLE_KEY` solo en backend; nunca se expone en el navegador.
- Las tablas propias de `public` no quedan consultables directamente con la `anon key`; la informacion publica se expone por funciones Netlify que filtran campos seguros.
- Las RPC de `public` no quedan ejecutables por `anon`/`authenticated` salvo que se habilite explicitamente una necesidad.
- El dominio canonico usa HTTPS y Netlify fuerza headers basicos de seguridad.

## Datos personales minimos

- Para usuarios finales: Google login puede entregar nombre, email y foto solo para autenticacion. No se usa para segmentar edad o genero.
- Para locales: se guarda email verificado, nombre del local, telefono/WhatsApp si lo declaran, direccion, barrio/ciudad y datos comerciales de la ficha.
- Para analitica: se guardan eventos anonimos de navegacion, filtros usados, fichas abiertas y clics de intencion.

## Medidas contra spam y abuso

- No se aceptan solicitudes de local anonimas.
- No se aceptan solicitudes con email libre no verificado.
- El plan, tipo de oferta y categoria se validan contra listas permitidas en backend.
- Se limita la cantidad de solicitudes por email verificado en una ventana de 24 horas.
- Cualquier solicitud publicada requiere aprobacion manual.

## Pendiente recomendado

- Agregar un registro de auditoria de cambios de admin.
- Revisar reglas RLS y permisos de Supabase cada vez que se agregue una tabla nueva.
- Definir una politica publica de privacidad y terminos de uso antes de escalar fuerte.
- Revisar backups/exportaciones periodicas de datos criticos.

## Nota sobre Supabase Advisor

El 30/06/2026 se aplico `supabase/migrations/0009_lock_down_public_table_access.sql` para cerrar el acceso directo a tablas propias desde PostgREST con `anon`.

Despues del cierre, el unico error restante del asesor puede aparecer sobre `public.spatial_ref_sys`, tabla de referencia EPSG creada por PostGIS. Esa tabla no contiene datos de usuarios, locales ni metricas de GlutenGo. Supabase no permite aplicarle RLS desde el SQL Editor porque pertenece a la extension. Si en el futuro se reestructura la base, conviene crear/mover PostGIS al esquema `extensions` para evitar ese aviso.
