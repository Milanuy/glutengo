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
7. Revisar la preparacion y la vista previa.
8. Guardar o usar `Guardar y publicar`.

Cuando el estado queda en `active`, el local se publica automaticamente en GlutenGo mediante `/api/public-businesses`.
Si tiene latitud y longitud validas aparece tambien en el mapa. Si todavia no tiene coordenadas, queda visible en el directorio y en su ficha publica, pero sin pin de mapa hasta completar la ubicacion.

El admin evita publicar cuando faltan datos criticos, como nombre, tipo de oferta, categoria, direccion, zona, slug o contacto directo si ese beneficio esta marcado.
Los avisos no bloquean la publicacion: sirven para recordar casos como falta de coordenadas, falta de descripcion, logo habilitado sin URL o beneficios pagos marcados en un plan basico.

## Checklist de beneficios

- `Insignia Datos confirmados`: mostrar que GlutenGo reviso identidad, contacto, canales y datos basicos del local. No equivale a auditoria de protocolo.
- `Insignia Protocolo certificado`: mostrar que el local supero una revision especifica del manejo sin gluten.
- `WhatsApp / Instagram`: habilitar contacto directo en la ficha.
- `Logo visible`: usar logo real del negocio.
- `Prioridad en listados`: ordenar antes que fichas basicas.
- `Home destacado`: cupo de destaque dentro de la home.
- `Banner lateral/flotante`: inventario comercial secundario, visible pero discreto.
- `Mega banner`: inventario premium, recomendado solo para Certificado, sponsor o acuerdos especiales.

## Criterio comercial para banners

- Basico: sin banners ni prioridad.
- Verificado / Datos confirmados: puede acceder a destacado en home o banner lateral/flotante si hay cupo de zona.
- Certificado / Protocolo certificado: prioridad para home, banner lateral/flotante y mega banner.
- Mega banner: usarlo como campana limitada por zona, temporada o sponsor. No conviene mostrar muchos a la vez porque baja la confianza de la guia.

## Notas tecnicas

La tabla real de produccion actualmente tiene campos basicos (`nombre`, `tipo`, `direccion`, `barrio`, `email`, `telefono`, `plan`, `mensaje`, `status`, `created_at`).
Para no depender de migraciones, el checklist y los campos editoriales se guardan en `businesses.mensaje` como JSON.
Si mas adelante se agrega `admin_notes`, la funcion publica ya esta preparada para leer ese campo primero y mantener compatibilidad.

La home, el mapa, el directorio y `lugar.html` mezclan los lugares estaticos de `data.js` con los negocios activos que devuelve `/api/public-businesses`.
