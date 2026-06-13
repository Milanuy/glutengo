# GlutenGo 🌾

Plataforma para que celíacos encuentren lugares seguros donde comer en Uruguay.

**Sitio:** https://glutengo.netlify.app

## Estado actual

**Fase 0 — Landing de validación** (en producción)

Landing estática con:
- Directorio de 23 locales reales de Montevideo
- Buscador por nombre y filtros por categoría
- Fichas individuales por local con link a Google Maps
- Formulario de lista de espera (Netlify Forms)

## Stack

| Capa | Tecnología |
|---|---|
| Frontend (Fase 0) | HTML + Vanilla JS + CDN libs |
| Frontend (Fase 3+) | Next.js 15 + React + TypeScript + Tailwind |
| Base de datos | Supabase (PostgreSQL + PostGIS) |
| Deploy (Fase 0) | Netlify drag & drop |
| Deploy (Fase 3+) | Netlify → GitHub |

## Estructura

```
/
├── index.html       # Home: hero + rail + directorio con buscador
├── lugar.html       # Ficha dinámica de cada local (JS carga desde data.js)
├── gracias.html     # Confirmación formulario lista de espera
├── data.js          # 23 locales seed de Montevideo
├── supabase/
│   └── migrations/  # SQL migrations para Supabase
└── docs/            # Documentación técnica del proyecto
```

## Documentación

- [Visión y alcance](docs/00-VISION-Y-ALCANCE.md)
- [Arquitectura](docs/01-ARQUITECTURA.md)
- [Modelo de datos](docs/02-MODELO-DATOS.md)
- [Algoritmo GlutenGo Score](docs/03-GLUTENGO-SCORE.md)
- [Roadmap MVP](docs/04-ROADMAP-MVP.md)

## Roadmap

| Fase | Estado |
|---|---|
| Fase 0 — Landing de validación | ✅ Live |
| Fase 1 — Directorio + fichas + buscador | ✅ Live |
| Fase 2 — Mapa interactivo | 🔜 |
| Fase 3 — Registro de visitas + Score | 🔜 |
| Fase 4 — Beta cerrada (20-50 celíacos) | 🔜 |
| Fase 5 — Lanzamiento público | 🔜 |
