# GlutenGo Score — Especificación del Algoritmo

**Última actualización:** 2026-06-12

El score es el activo central de la plataforma. Esta especificación prioriza tres propiedades, en este orden: **(1) un falso "verde" es peor que un falso "rojo"**, (2) resistencia a manipulación, (3) explicabilidad — un usuario debe poder entender por qué un local tiene el score que tiene.

---

## 1. Escala y bandas

| Score | Banda | Pin |
|---|---|---|
| 95–100 | Comé tranquilo | Verde |
| 80–94 | Muy recomendado | Verde |
| 60–79 | Consultá antes | Amarillo |
| 0–59 | Requiere validación | Rojo |
| sin datos suficientes | Requiere validación | Gris |

## 2. Diseño del cálculo

### Paso 1 — Calidad de cada visita aprobada: `q ∈ [0,1]`

Cada visita del formulario se convierte en un número:

```
si had_issues_after = true  →  q = 0        (incidente: señal dominante)
si no:
  q = 0.45 · overall_positive
    + 0.20 · (staff_knowledge − 1) / 2      (1→0, 2→0.5, 3→1; null→0.5)
    + 0.15 · explained_protocols             (null→0.5)
    + 0.20 · perceived_separation            (null→0.5)
```

Razonamiento de pesos: la experiencia global y la separación física de productos son los mejores predictores de seguridad real; la explicación de protocolos puede ser teatro. Los `null` (no contestó) valen 0.5 para no premiar ni castigar la omisión.

### Paso 2 — Peso de cada visita: recencia × usuario único

```
w = 0.5 ^ (días_desde_visita / 180)
```

Semivida de 180 días: una visita de hace 6 meses pesa la mitad que una de hoy. Un local que cambió de cocina o de dueño converge a su realidad actual en meses, no años.

Además, **por usuario solo cuentan sus 3 visitas más recientes a ese local**. Esto neutraliza al dueño (o al hater) que registra 20 visitas: su influencia queda acotada.

### Paso 3 — Promedio bayesiano (defensa contra muestras chicas)

```
Q = (C·m + Σ wᵢ·qᵢ) / (C + Σ wᵢ)      con  m = 0.65,  C = 5
```

El prior `m = 0.65` (zona "consultá antes") con peso de 5 visitas equivalentes significa: un local nuevo con 2 reseñas perfectas NO sale verde — sale amarillo alto. La confianza se gana con volumen. Es la misma matemática que usa IMDb para su Top 250.

### Paso 4 — Reglas duras (overrides)

Se aplican después del cálculo, en orden:

1. **Menos de 3 usuarios únicos** → sin score numérico público. Se muestra "Requiere validación · N visitas registradas" (pin gris).
2. **Menos de 8 usuarios únicos** → score se topea en 94 (no puede ser "Comé tranquilo").
3. **Incidente (`had_issues_after`) reportado en los últimos 90 días** → score se topea en 79 ("Consultá antes"), sin importar cuán alto dé la fórmula. La ficha muestra la advertencia. Un solo síntoma reciente reportado debe bajar el semáforo: el costo de equivocarse es la salud de alguien.

```
score = round(100 · Q)  →  aplicar overrides  →  asignar banda
```

### Ejemplo numérico

Local con 10 visitas aprobadas de 9 usuarios, todas positivas, promedio de antigüedad 60 días, sin incidentes:
- q promedio ≈ 0.93, Σw ≈ 7.9
- Q = (5·0.65 + 7.9·0.93) / (5 + 7.9) = (3.25 + 7.35) / 12.9 ≈ **0.82 → score 82, "Muy recomendado"**

El mismo local necesita ~25 visitas positivas sostenidas para superar 95. Correcto: "Comé tranquilo" debe ser difícil de alcanzar.

## 3. Implementación SQL

```sql
create or replace function recompute_score(p_establishment_id uuid)
returns void language plpgsql security definer as $$
declare
  v_sum_wq numeric := 0;
  v_sum_w  numeric := 0;
  v_unique int;
  v_total  int;
  v_recent_incident boolean;
  v_q numeric;
  v_score numeric;
  v_band score_band;
  r record;
begin
  for r in
    select *,
           row_number() over (partition by user_id order by visited_on desc) as rn
    from visits
    where establishment_id = p_establishment_id and status = 'approved'
  loop
    continue when r.rn > 3;  -- máx 3 visitas por usuario
    if r.had_issues_after then
      v_q := 0;
    else
      v_q := 0.45 * (r.overall_positive)::int
           + 0.20 * coalesce((r.staff_knowledge - 1) / 2.0, 0.5)
           + 0.15 * coalesce(r.explained_protocols::int::numeric, 0.5)
           + 0.20 * coalesce(r.perceived_separation::int::numeric, 0.5);
    end if;
    v_sum_w  := v_sum_w  + power(0.5, (current_date - r.visited_on) / 180.0);
    v_sum_wq := v_sum_wq + power(0.5, (current_date - r.visited_on) / 180.0) * v_q;
  end loop;

  select count(distinct user_id), count(*)
    into v_unique, v_total
  from visits
  where establishment_id = p_establishment_id and status = 'approved';

  select exists (
    select 1 from visits
    where establishment_id = p_establishment_id
      and status = 'approved' and had_issues_after
      and visited_on > current_date - 90
  ) into v_recent_incident;

  -- bayesiano: prior m=0.65, C=5
  v_score := round(100 * (5 * 0.65 + v_sum_wq) / (5 + v_sum_w), 2);

  -- overrides
  if v_unique < 3 then
    v_score := null;
  elsif v_recent_incident then
    v_score := least(v_score, 79);
  elsif v_unique < 8 then
    v_score := least(v_score, 94);
  end if;

  v_band := case
    when v_score is null    then 'requiere_validacion'
    when v_score >= 95      then 'come_tranquilo'
    when v_score >= 80      then 'muy_recomendado'
    when v_score >= 60      then 'consulta_antes'
    else 'requiere_validacion'
  end;

  update establishments set
    score = v_score,
    score_band = v_band,
    approved_visits_count = v_total,
    unique_visitors_count = v_unique,
    last_visit_at = (select max(created_at) from visits
                     where establishment_id = p_establishment_id and status='approved'),
    updated_at = now()
  where id = p_establishment_id;

  insert into score_history (establishment_id, score, score_band, approved_visits_count)
  values (p_establishment_id, v_score, v_band, v_total);
end $$;

create or replace function on_visit_approved()
returns trigger language plpgsql security definer as $$
begin
  perform recompute_score(new.establishment_id);
  update profiles set visits_count = visits_count + 1 where id = new.user_id;
  return new;
end $$;
```

Además: un cron job semanal (`pg_cron`, incluido en Supabase) recalcula todos los locales con visitas, para que el decaimiento temporal se refleje aunque no entren visitas nuevas.

```sql
select cron.schedule('weekly-score-decay', '0 6 * * 1',
  $$ select recompute_score(id) from establishments
     where approved_visits_count > 0 $$);
```

## 4. Transparencia (decisión de producto)

La ficha de cada local debe mostrar, junto al score: "Basado en N visitas de M personas · última hace X días" y el desglose (¿cuántos reportaron protocolos? ¿separación? ¿incidentes?). **El score sin contexto es una caja negra que destruye la confianza que intenta crear.** La fórmula exacta debería ser pública en una página `/como-funciona-el-score` — la transparencia es defensa de marca.

## 5. Qué vigilar después del lanzamiento

- Distribución de scores: si todo el mapa queda gris/amarillo por falta de datos, bajar el umbral de 3 usuarios únicos puede ser tentador — resistirlo y empujar la beta con más usuarios. Si todo queda verde, los pesos son demasiado generosos.
- Tasa de incidentes (`had_issues_after`): si es ~0%, la pregunta está mal formulada o la gente no reporta; considerar follow-up por email a las 48 h de la visita (v1.1).
- Los pesos (0.45/0.20/0.15/0.20), la semivida (180 d) y el prior (0.65, C=5) son hipótesis iniciales razonables, no verdades. Revisarlos con datos reales a los 3 meses.
