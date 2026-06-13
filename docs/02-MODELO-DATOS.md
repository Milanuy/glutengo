# GlutenGo — Modelo de Datos (PostgreSQL / Supabase)

**Última actualización:** 2026-06-12

Schema completo del MVP. Listo para usar como primera migración (`supabase/migrations/0001_initial.sql`). Diseñado para caber holgado en los 500 MB del free tier: con 1.000 locales y 50.000 visitas se usa < 50 MB.

---

## 1. Diagrama de entidades

```
profiles ──< visits >── establishments ──< establishment_photos
    │           │              │
    └──< favorites >───────────┘
                │
establishments ──< score_history
visits ──< reports (futuros reportes sobre reseñas)
```

## 2. Migración inicial

```sql
-- ============================================
-- EXTENSIONES
-- ============================================
create extension if not exists postgis;        -- búsqueda geográfica
create extension if not exists pg_trgm;        -- búsqueda por nombre tolerante a typos

-- ============================================
-- ENUMS
-- ============================================
create type establishment_category as enum (
  'restaurante','cafeteria','panaderia','heladeria',
  'rotiseria','hotel','almacen','otro'
);

create type visit_status as enum ('pending','approved','rejected');

create type score_band as enum (
  'come_tranquilo',      -- 95-100
  'muy_recomendado',     -- 80-94
  'consulta_antes',      -- 60-79
  'requiere_validacion'  -- 0-59 o sin datos suficientes
);

-- ============================================
-- PERFILES (extiende auth.users de Supabase)
-- ============================================
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_url text,
  is_celiac boolean,                 -- autodeclarado, opcional
  role text not null default 'user' check (role in ('user','moderator','admin')),
  is_banned boolean not null default false,
  visits_count int not null default 0,     -- denormalizado, mantenido por trigger
  created_at timestamptz not null default now()
);

-- Trigger estándar Supabase: crear profile al registrarse
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- ESTABLECIMIENTOS
-- ============================================
create table establishments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                -- 'cafe-celeste-pocitos' (URL/SEO)
  name text not null,
  category establishment_category not null,
  description text,
  -- ubicación
  address text not null,
  city text not null,                       -- 'Montevideo','Canelones','Maldonado',...
  neighborhood text,                        -- 'Pocitos','Centro',...
  location geography(point, 4326) not null, -- PostGIS
  -- contacto
  phone text,
  whatsapp text,
  website text,
  instagram text,
  opening_hours jsonb,                      -- { "mon": "09:00-18:00", ... }
  menu_url text,
  -- atributos celíacos (declarados, no validados)
  is_dedicated_gf boolean not null default false,  -- 100% sin gluten
  -- score (denormalizado; fuente de verdad = función de recálculo)
  score numeric(5,2),                       -- null = sin datos
  score_band score_band not null default 'requiere_validacion',
  approved_visits_count int not null default 0,
  unique_visitors_count int not null default 0,
  last_visit_at timestamptz,
  -- gestión
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_est_location on establishments using gist (location);
create index idx_est_city_cat on establishments (city, category) where is_active;
create index idx_est_name_trgm on establishments using gin (name gin_trgm_ops);
create index idx_est_score on establishments (score desc nulls last) where is_active;

create table establishment_photos (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments on delete cascade,
  storage_path text not null,               -- Supabase Storage
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================
-- VISITAS (la tabla más importante del producto)
-- ============================================
create table visits (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  visited_on date not null,
  -- formulario rápido (7 preguntas)
  what_consumed text,
  informed_celiac boolean not null,         -- ¿avisó que es celíaco?
  staff_knowledge smallint check (staff_knowledge between 1 and 3),
                                            -- 1=no sabían, 2=algo, 3=protocolos claros
  explained_protocols boolean,
  perceived_separation boolean,             -- ¿separación de productos/utensilios?
  had_issues_after boolean not null,        -- ¿síntomas posteriores? (señal crítica)
  overall_positive boolean not null,        -- ¿volverías / fue buena experiencia?
  comment text check (char_length(comment) <= 1000),
  -- moderación
  status visit_status not null default 'pending',
  moderated_by uuid references profiles(id),
  moderated_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  -- anti-abuso: una visita por usuario/local/día
  unique (establishment_id, user_id, visited_on)
);

create index idx_visits_est on visits (establishment_id, status, visited_on desc);
create index idx_visits_user on visits (user_id, created_at desc);
create index idx_visits_pending on visits (created_at) where status = 'pending';

-- Rate limit: máx 3 visitas/día por usuario
create or replace function check_visit_rate_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from visits
      where user_id = new.user_id
        and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Límite de 3 visitas por día alcanzado';
  end if;
  return new;
end $$;

create trigger trg_visit_rate_limit
  before insert on visits
  for each row execute function check_visit_rate_limit();

-- ============================================
-- FAVORITOS
-- ============================================
create table favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  establishment_id uuid not null references establishments on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, establishment_id)
);

-- ============================================
-- HISTORIAL DE SCORE (evolución de confianza + auditoría)
-- ============================================
create table score_history (
  id bigint generated always as identity primary key,
  establishment_id uuid not null references establishments on delete cascade,
  score numeric(5,2),
  score_band score_band not null,
  approved_visits_count int not null,
  computed_at timestamptz not null default now()
);

create index idx_score_hist on score_history (establishment_id, computed_at desc);
```

## 3. Row Level Security

```sql
alter table profiles enable row level security;
alter table establishments enable row level security;
alter table establishment_photos enable row level security;
alter table visits enable row level security;
alter table favorites enable row level security;
alter table score_history enable row level security;

-- helper: ¿es moderador o admin?
create or replace function is_moderator()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('moderator','admin') and not is_banned
  );
$$;

-- PROFILES: lectura pública (datos mínimos), edición propia
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'user');  -- nadie se autoasciende

-- ESTABLISHMENTS: lectura pública de activos; escritura solo staff
create policy "est_select" on establishments for select
  using (is_active or is_moderator());
create policy "est_write" on establishments for all
  using (is_moderator());

create policy "est_photos_select" on establishment_photos for select using (true);
create policy "est_photos_write" on establishment_photos for all
  using (is_moderator());

-- VISITS: aprobadas son públicas; el autor ve las propias; staff ve todo
create policy "visits_select" on visits for select
  using (status = 'approved' or user_id = auth.uid() or is_moderator());
create policy "visits_insert" on visits for insert
  with check (
    user_id = auth.uid()
    and not exists (select 1 from profiles where id = auth.uid() and is_banned)
  );
create policy "visits_moderate" on visits for update
  using (is_moderator());

-- FAVORITES: estrictamente propios
create policy "fav_all_own" on favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- SCORE_HISTORY: lectura pública, escritura solo vía función (security definer)
create policy "score_hist_select" on score_history for select using (true);
```

## 4. Recálculo del score

El trigger que dispara el recálculo al aprobar una visita y la función `recompute_score(establishment_id)` están especificados en `03-GLUTENGO-SCORE.md` (la fórmula es la decisión de producto más importante; merece documento propio).

```sql
create trigger trg_visit_approved
  after update of status on visits
  for each row
  when (new.status = 'approved' and old.status = 'pending')
  execute function on_visit_approved();   -- definida en 03
```

## 5. Búsqueda

```sql
-- Lugares cerca de un punto (mapa)
select id, name, slug, score, score_band,
       st_y(location::geometry) as lat, st_x(location::geometry) as lng
from establishments
where is_active
  and st_dwithin(location, st_point(:lng,:lat)::geography, :radius_m);

-- Búsqueda por nombre tolerante a typos
select * from establishments
where is_active and name % :query   -- operador pg_trgm
order by similarity(name, :query) desc limit 20;
```

Ambas se exponen como funciones RPC de Supabase (`nearby_establishments`, `search_establishments`) para llamarlas desde el cliente con una sola request.

## 6. Storage

Bucket `establishment-photos` (público, escritura solo moderadores). Las fotos de usuarios en reseñas quedan para v1.1 — cuando exista, irán a bucket separado con cola de moderación.
