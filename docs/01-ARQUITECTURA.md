# GlutenGo — Arquitectura Técnica

**Última actualización:** 2026-06-12

---

## 1. Vista general

```
Usuario (móvil/desktop)
        │
        ▼
┌─────────────────────────────┐
│  Next.js (App Router)       │  ← Vercel
│  - Server Components (SEO)  │
│  - API Route Handlers       │
└──────────┬──────────────────┘
           │ supabase-js (RLS activo)
           ▼
┌─────────────────────────────┐     ┌──────────────────┐
│  Supabase                   │     │ Google Maps API  │
│  - PostgreSQL + PostGIS     │     │ (solo cliente,   │
│  - Auth (Google, email)     │     │  carga lazy)     │
│  - Storage (fotos locales)  │     └──────────────────┘
│  - Edge Functions (score)   │
└─────────────────────────────┘
```

Principio rector: **cero servidores propios, cero servicios pagos hasta validar.** Todo corre en free tiers.

## 2. Decisiones técnicas y su porqué

### Next.js App Router con Server Components
Las fichas de establecimiento se renderizan en servidor → HTML completo indexable por Google. Para una plataforma cuyo canal de adquisición principal será la búsqueda "restaurante sin gluten montevideo", **el SEO no es un extra, es la estrategia de captación**. Cada local = una URL pública (`/lugar/[slug]`) con metadata, Open Graph y JSON-LD (`schema.org/Restaurant` + `aggregateRating`).

### ISR (Incremental Static Regeneration) para fichas
Las fichas cambian poco. Se generan estáticas y se revalidan cada hora o on-demand cuando entra una visita nueva (`revalidatePath`). Resultado: velocidad máxima en móvil y mínimo consumo de recursos.

### Supabase con RLS como única capa de autorización
No hay backend intermedio. El cliente habla directo con Supabase y las Row Level Security policies garantizan que nadie escriba donde no debe. Menos código, menos superficie de error. Las policies están en `02-MODELO-DATOS.md`.

### Score calculado en la base, no en el cliente
Un trigger/función PostgreSQL recalcula el score cuando se aprueba una visita. El cliente solo lee. Esto evita inconsistencias y hace el score auditable.

### Google Maps: estrategia de contención de costos
Free tier 2026: **10.000 cargas de mapa/mes** (SKU Essentials, ya no existe el crédito de USD 200). Mitigaciones:

1. **La home NO carga el mapa automáticamente.** Muestra lista de lugares (SSR, gratis e indexable) con botón "Ver mapa". Cada carga de mapa cuesta cuota; una lista no.
2. Mapa con `loading=async` y solo cuando el usuario lo pide.
3. Ficha de local: imagen estática del mapa o link directo a Google Maps (deep link gratis), no un mapa embebido por ficha.
4. Si la tracción supera ~9.000 cargas/mes: migrar el render del mapa a **MapLibre GL + tiles gratuitos (OpenFreeMap/Protomaps)** manteniendo los datos propios. El pin y la ficha son nuestros; el proveedor de tiles es intercambiable. Esta puerta de salida se diseña desde el día 1 encapsulando el mapa en un componente `<MapView>` único.

### Geocodificación
Las coordenadas de los ~150 locales seed se cargan una vez (Geocoding API entra en el free tier de 10K). No se geocodifica en runtime.

## 3. Estructura del proyecto

```
glutengo/
├── app/
│   ├── layout.tsx                 # Shell, fuentes, metadata base
│   ├── page.tsx                   # Home: lista + CTA mapa (SSR)
│   ├── mapa/page.tsx              # Mapa interactivo (client)
│   ├── lugar/[slug]/page.tsx      # Ficha establecimiento (ISR)
│   ├── lugar/[slug]/visita/page.tsx  # Form registro de visita
│   ├── buscar/page.tsx            # Resultados de búsqueda
│   ├── favoritos/page.tsx
│   ├── perfil/page.tsx
│   ├── admin/                     # Panel moderación (rol admin)
│   │   ├── page.tsx               # Cola de visitas pendientes
│   │   └── lugares/page.tsx       # ABM establecimientos
│   ├── api/revalidate/route.ts    # Webhook revalidación ISR
│   ├── sitemap.ts                 # Sitemap dinámico (SEO)
│   └── robots.ts
├── components/
│   ├── map/MapView.tsx            # ÚNICO punto de contacto con Maps API
│   ├── score/ScoreBadge.tsx       # Pin/badge verde-amarillo-rojo
│   ├── establishment/...
│   └── visit/VisitForm.tsx
├── lib/
│   ├── supabase/                  # Clientes (server, client, middleware)
│   ├── score.ts                   # Tipos y helpers del score (lectura)
│   └── seo.ts                     # JSON-LD builders
├── supabase/
│   ├── migrations/                # SQL versionado (ver 02-MODELO-DATOS.md)
│   └── functions/                 # Edge functions si hacen falta
└── middleware.ts                  # Refresh de sesión Supabase
```

## 4. Flujos principales

**Consulta (sin login):** Home → busca o abre mapa → toca pin → ficha con score, visitas recientes, último comentario → botón WhatsApp/cómo llegar. *Todo el flujo de consulta es público: la fricción de login solo aparece al aportar.*

**Aporte (con login):** Ficha → "Registré una visita" → login Google si no tiene sesión → formulario de 7 preguntas + comentario (objetivo: < 60 segundos) → queda `pending` → moderador aprueba → score se recalcula → ISR revalida la ficha.

**Moderación:** Admin ve cola de visitas `pending` → aprueba/rechaza → las cuentas con reseñas rechazadas repetidas quedan marcadas.

## 5. SEO (estrategia de adquisición)

- URLs limpias: `/lugar/cafe-celeste-pocitos`, `/buscar?ciudad=montevideo&categoria=panaderia`
- Páginas de listado por ciudad/categoría generadas estáticamente: `/montevideo/panaderias-sin-gluten` — estas páginas son las que capturan búsquedas long-tail
- JSON-LD `Restaurant` + `AggregateRating` en cada ficha (el score se mapea a ratingValue)
- Sitemap dinámico + Google Search Console desde el día 1
- Core Web Vitals: sin mapa en home, imágenes `next/image`, fuentes self-hosted

## 6. Mobile first

- Diseño base 375px, navegación inferior tipo app (Mapa / Buscar / Favoritos / Perfil)
- El formulario de visita usa inputs nativos (radio, toggle) — nada de dropdowns complejos
- PWA básica (manifest + ícono instalable). No service worker offline en MVP: complejidad sin retorno claro todavía. Esto también prepara el terreno para "app" sin desarrollar apps nativas.

## 7. Seguridad y abuso

- RLS en todas las tablas (detalle en 02-MODELO-DATOS.md)
- Visitas con estado `pending` por defecto: nada se publica sin moderación al inicio
- Rate limit de visitas: máx. 3 por usuario por día (constraint + check en insert)
- Una visita por usuario por local por día (unique index)
- CAPTCHA invisible (Cloudflare Turnstile, gratis) en registro y form de visita

## 8. Lo que NO construimos (anti-sobreingeniería)

- Sin microservicios, sin colas, sin Redis, sin Docker propio
- Sin React Native / Expo hasta validar
- Sin sistema de notificaciones (las alertas v1.2 arrancarán con email vía Resend free tier)
- Sin tests E2E exhaustivos en MVP: tests unitarios del cálculo de score (es lo único con lógica de negocio crítica) + smoke tests manuales
