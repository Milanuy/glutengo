# GlutenGo — Roadmap MVP y Costos

**Última actualización:** 2026-06-12
**Contexto:** founder construyendo con Claude, presupuesto mínimo (solo infraestructura).

---

## 1. Roadmap por fases

Las semanas asumen dedicación parcial (10-15 h/semana) construyendo con Claude. Si dedicás más, comprimí proporcionalmente. La regla: **cada fase termina con algo usable, no con código a medias.**

### Fase 0 — Fundaciones (semana 1)
- Crear proyecto Supabase + repo Next.js + deploy inicial en Vercel
- Aplicar migración `0001_initial.sql` (ver 02-MODELO-DATOS.md)
- Auth con Google + email funcionando
- Dominio comprado y conectado (`glutengo.uy` o `.com`)
- **Entregable: "hola mundo" autenticado en producción.** Deploy continuo desde el día 1; nada vive solo en tu máquina.

### Fase 1 — Contenido consultable (semanas 2-4)
- ABM de establecimientos (panel admin mínimo)
- Carga seed: 100-150 locales de Montevideo (esto es trabajo de datos, no de código — arrancarlo en paralelo desde la semana 1)
- Ficha pública de establecimiento con ISR + JSON-LD
- Home con listado por ciudad/categoría (SSR)
- Buscador por nombre/zona/categoría
- **Entregable: directorio navegable e indexable.** Search Console configurado.

### Fase 2 — Mapa (semana 5)
- Componente `<MapView>` con Google Maps, carga lazy
- Pines con colores por banda de score
- Bottom sheet con ficha resumida al tocar pin
- **Entregable: el flujo de consulta completo del MVP.**

### Fase 3 — Motor de confianza (semanas 6-8)
- Formulario de registro de visita (< 60 segundos en completarse)
- Función `recompute_score` + triggers + tests unitarios de la fórmula
- Cola de moderación en `/admin`
- Favoritos
- Disclaimer legal + términos de uso + política de privacidad
- **Entregable: producto completo en privado.**

### Fase 4 — Beta cerrada (semanas 9-12)
- Reclutar 20-50 celíacos en comunidades (ACELU, grupos de Facebook/Instagram)
- Objetivo: 200 visitas registradas, feedback de UX del formulario
- Ajustes según uso real; analytics básico con Vercel Web Analytics (free tier)
- **Entregable: mapa con locales validados de verdad.**

### Fase 5 — Lanzamiento público (semana 13+)
- Apertura + difusión en comunidades y prensa local (la historia "mapa celíaco hecho por la comunidad" es noteable para medios uruguayos)
- Medir contra las métricas de validación de 00-VISION-Y-ALCANCE.md
- Recién acá se decide v1.1 (rankings, fotos en reseñas) según datos

**Total estimado: ~3 meses hasta beta, ~4 hasta lanzamiento público.**

## 2. Costos verificados (junio 2026)

### Fase MVP / validación (meses 1-6)

| Concepto | Plan | Costo |
|---|---|---|
| Vercel | Hobby | USD 0 |
| Supabase | Free (500 MB DB, 50K MAU, 1 GB storage) | USD 0 |
| Google Maps | Free tier: 10.000 cargas mapa/mes + 10.000 geocodificaciones | USD 0 |
| Dominio | `.com` (~USD 12/año) o `.uy` (~USD 25-50/año) | ~USD 1-4/mes |
| Cloudflare Turnstile (CAPTCHA) | Free | USD 0 |
| **Total** | | **~USD 15-50/año** |

Configurar **alertas de presupuesto en Google Cloud (umbral USD 1)** y tope de cuota diaria en la Maps API. Es la única factura que puede sorprenderte.

### Cuándo aparecen costos reales (señales de tracción, no de fracaso)

| Disparador | Acción | Costo |
|---|---|---|
| Primer ingreso (Plan Destacado) | Vercel Hobby prohíbe uso comercial → Pro | USD 20/mes |
| DB > 500 MB o necesidad de backups serios | Supabase Pro | USD 25/mes |
| > ~9.000 cargas de mapa/mes | Migrar `<MapView>` a MapLibre + tiles gratuitos | USD 0 (trabajo, no plata) |
| Emails transaccionales (alertas v1.2) | Resend free (3.000/mes) → pago | USD 0-20/mes |

Escenario con tracción real y primeros clientes: **~USD 45-65/mes**, cubrible con 3-4 comercios en Plan Destacado ($299-499 UYU c/u). El modelo se autofinancia temprano si funciona.

### Supabase free: advertencia operativa
Los proyectos free se **pausan tras 1 semana sin actividad**. Durante el desarrollo no pasa (la usás a diario), pero configurar un ping con GitHub Actions (cron cada 3 días que hace un select trivial) elimina el riesgo.

## 3. Orden de trabajo recomendado con Claude

1. Cada fase se trabaja como sesiones cortas con objetivo único ("implementar el formulario de visita"), no "hacé la fase 3".
2. La migración SQL y la función de score ya están especificadas en los docs 02 y 03 — son copy-paste con ajustes, no diseño desde cero.
3. Antes de escribir UI, dejá los datos seed cargados: desarrollar contra un mapa vacío esconde problemas de diseño (clustering de pines, listas largas).
4. Tests unitarios solo donde duele: la fórmula del score. El resto, smoke test manual por fase.

## 4. Qué NO hacer en los próximos 4 meses

- No desarrollar apps nativas ni React Native.
- No construir el panel para comercios ni cobrar a nadie (el pitch a comercios sin tráfico que mostrarles es débil; con 3 meses de datos es fuerte).
- No comprar publicidad. El canal es SEO + comunidades existentes de celíacos.
- No agregar features que no estén en la Fase actual. Cada "ya que estamos" alarga la fase y retrasa el único evento que importa: usuarios reales usando el producto.
