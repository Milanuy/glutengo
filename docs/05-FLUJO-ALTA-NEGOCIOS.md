# Flujo de alta de negocios

## Donde llegan las solicitudes

Los negocios que completan `negocios.html` se guardan en Supabase, tabla `businesses`.
Se revisan desde `admin.html`, usando la contraseña de administrador.

Estados principales:

- `pending`: solicitud basica pendiente de revision.
- `pending_payment`: eligio plan pago y queda aguardando confirmacion.
- `active`: aprobado/activo.
- `rejected`: rechazado.
- `expired`: suspendido o vencido.

## Como activar un local

1. Entrar a `admin.html`.
2. Abrir una solicitud con `Configurar`, `Editar` o `Revisar`.
3. Revisar los datos del local.
4. Definir plan, estado y prioridad.
5. Completar la configuracion editorial: slug, descripcion, coordenadas, logo, fotos y destaque.
6. Marcar el checklist de beneficios habilitados.
7. Guardar o usar `Guardar y activar`.

## Checklist de beneficios

- `Badge Verificado`: mostrar insignia de verificacion.
- `Badge Certificado`: mostrar insignia de certificacion.
- `WhatsApp / Instagram`: habilitar contacto directo en la ficha.
- `Logo visible`: usar logo real del negocio.
- `Prioridad en listados`: ordenar antes que fichas basicas.
- `Home destacado`: cupo de destaque dentro de la home.
- `Banner lateral/flotante`: inventario comercial secundario, visible pero discreto.
- `Mega banner`: inventario premium, recomendado solo para Certificado, sponsor o acuerdos especiales.

## Criterio comercial para banners

- Basico: sin banners ni prioridad.
- Verificado: puede acceder a destacado en home o banner lateral/flotante si hay cupo de zona.
- Certificado: prioridad para home, banner lateral/flotante y mega banner.
- Mega banner: usarlo como campana limitada por zona, temporada o sponsor. No conviene mostrar muchos a la vez porque baja la confianza de la guia.

## Notas tecnicas

El checklist y los campos editoriales se guardan en `businesses.admin_notes` como JSON.
Esto permite operar el alta sin crear nuevas tablas inmediatamente.

La ficha publica estatica sigue usando `data.js`. Para publicacion automatica completa desde admin, el siguiente paso es exponer negocios `active` desde una funcion publica y renderizarlos con coordenadas, logo y beneficios.
