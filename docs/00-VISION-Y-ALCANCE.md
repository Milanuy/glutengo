# GlutenGo — Visión y Alcance del MVP

**Última actualización:** 2026-06-12
**Estado:** Definición técnica aprobada para arranque

---

## 1. Qué es GlutenGo

Plataforma web mobile-first que responde una sola pregunta: **"¿Puedo comer tranquilo en este lugar?"** — para personas celíacas en Uruguay, mediante experiencias validadas por la comunidad.

No es un directorio. El activo central es la **confianza**, materializada en el GlutenGo Score (0-100).

## 2. Decisión crítica: el recorte del MVP

El brief original lista 10 funcionalidades. Construirlas todas antes de validar es el error clásico que mata startups. El MVP se recorta a **lo mínimo que prueba la hipótesis central**:

> *Hipótesis: los celíacos uruguayos van a consultar y aportar experiencias si existe un lugar confiable donde hacerlo.*

### Dentro del MVP (v1.0)

| Funcionalidad | Justificación |
|---|---|
| Mapa interactivo con pines verde/amarillo/rojo | Es el corazón del producto |
| Buscador (nombre, zona, categoría) | Sin búsqueda el mapa no escala |
| Ficha de establecimiento | Donde vive la confianza |
| Registro de visita (formulario rápido) | Es el motor de datos. Sin esto no hay score |
| GlutenGo Score automático | El diferenciador |
| Auth (Google + email) | Necesario para registrar visitas |
| Favoritos | Costo casi cero, alto valor de retención |
| Moderación mínima (cola de revisión) | Una reseña falsa destruye el activo confianza |

### Fuera del MVP (post-validación)

| Funcionalidad | Por qué espera | Cuándo |
|---|---|---|
| Alertas / seguir locales | Requiere notificaciones (email/push), complejidad alta | v1.2 |
| Rankings automáticos | Son solo queries; fáciles de agregar cuando haya datos | v1.1 |
| Gamificación (Explorador→Embajador) | Sin masa crítica de usuarios no motiva a nadie | v1.2 |
| Fotos en reseñas | Moderación de imágenes = carga operativa y legal | v1.1 |
| Perfiles públicos de usuario | No aporta a la hipótesis central | v1.2 |
| Panel para comercios / monetización | Primero usuarios, después comercios | v2 |
| GlutenGo Verified | Requiere operación física (auditorías) | v3 |
| Auth con Apple | Solo obligatorio si hay app iOS nativa | Con la app |
| Apps nativas | El brief ya lo define: web responsive primero | Post-validación |

## 3. El riesgo nº 1: arranque en frío

Un mapa vacío es un producto muerto. Nadie registra la primera visita en una plataforma sin contenido.

**Mitigación obligatoria antes del lanzamiento público:**

1. **Carga seed de 100-150 establecimientos** de Montevideo con datos básicos (nombre, dirección, categoría, contacto). Fuentes: listados de ACELU (Asociación Celíaca del Uruguay), comunidades de Instagram/Facebook de celíacos uruguayos, relevamiento propio.
2. Los locales seed arrancan con score "Requiere validación" (gris/sin datos) — honesto y genera incentivo a validar.
3. **Beta cerrada con 20-50 celíacos activos** reclutados en esas comunidades, con el objetivo de llegar a ~200 visitas registradas antes del lanzamiento abierto.

Si no podés conseguir 20 personas dispuestas a usar la beta, esa es la validación negativa más barata posible — y conviene saberlo antes de escribir código de más.

## 4. Riesgos que el brief no menciona

- **Responsabilidad legal:** si alguien se intoxica en un local "verde", ¿qué pasa? Necesario: disclaimer visible ("información comunitaria, no garantía médica") y términos de uso desde el día 1. No es opcional.
- **Manipulación de reseñas:** dueños inflando su score o atacando competidores. El score incluye defensas (ver 03-GLUTENGO-SCORE.md), pero la moderación humana es irreemplazable al inicio.
- **Vercel Hobby prohíbe uso comercial.** Mientras no haya monetización es zona gris aceptable; al cobrar el primer peso, hay que pasar a Pro (USD 20/mes). Presupuestado en 04-ROADMAP-MVP.md.
- **Dependencia de Google Maps:** 10.000 cargas de mapa gratis/mes. Suficiente para validar; a ~330 sesiones con mapa/día se acaba. Mitigación en 01-ARQUITECTURA.md.

## 5. Métricas de validación (90 días post-beta)

- ≥ 300 usuarios registrados
- ≥ 500 visitas registradas
- ≥ 25% de usuarios con 2+ visitas registradas (retención de aporte)
- ≥ 40% de sesiones que abren al menos una ficha de local

Si a los 90 días no se acercan estos números, el problema es de adopción, no de features — y agregar funcionalidades no lo arregla.

## 6. Documentos del proyecto

- `01-ARQUITECTURA.md` — stack, estructura y decisiones técnicas
- `02-MODELO-DATOS.md` — schema PostgreSQL/Supabase completo
- `03-GLUTENGO-SCORE.md` — algoritmo del score
- `04-ROADMAP-MVP.md` — fases de desarrollo y costos
