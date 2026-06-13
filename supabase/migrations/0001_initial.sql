-- ============================================================
-- GlutenGo — Migración inicial
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- EXTENSIONES
-- ============================================================
create extension if not exists postgis;        -- búsqueda geográfica
create extension if not exists pg_trgm;        -- búsqueda tolerante a typos

-- ============================================================
-- ENUMS
-- ============================================================
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

-- ============================================================
-- PERFILES (extiende auth.users de Supabase)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_url text,
  is_celiac boolean,
  role text not null default 'user' check (role in ('user','moderator','admin')),
  is_banned boolean not null default false,
  visits_count int not null default 0,
  created_at timestamptz not null default now()
);

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

-- ============================================================
-- ESTABLECIMIENTOS
-- ============================================================
create table establishments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category establishment_category not null,
  description text,
  address text not null,
  city text not null,
  neighborhood text,
  location geography(point, 4326) not null,
  phone text,
  whatsapp text,
  website text,
  instagram text,
  opening_hours jsonb,
  menu_url text,
  is_dedicated_gf boolean not null default false,
  score numeric(5,2),
  score_band score_band not null default 'requiere_validacion',
  approved_visits_count int not null default 0,
  unique_visitors_count int not null default 0,
  last_visit_at timestamptz,
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
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- VISITAS
-- ============================================================
create table visits (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  visited_on date not null,
  what_consumed text,
  informed_celiac boolean not null,
  staff_knowledge smallint check (staff_knowledge between 1 and 3),
  explained_protocols boolean,
  perceived_separation boolean,
  had_issues_after boolean not null,
  overall_positive boolean not null,
  comment text check (char_length(comment) <= 1000),
  status visit_status not null default 'pending',
  moderated_by uuid references profiles(id),
  moderated_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
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

-- ============================================================
-- FAVORITOS
-- ============================================================
create table favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  establishment_id uuid not null references establishments on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, establishment_id)
);

-- ============================================================
-- HISTORIAL DE SCORE
-- ============================================================
create table score_history (
  id bigint generated always as identity primary key,
  establishment_id uuid not null references establishments on delete cascade,
  score numeric(5,2),
  score_band score_band not null,
  approved_visits_count int not null,
  computed_at timestamptz not null default now()
);

create index idx_score_hist on score_history (establishment_id, computed_at desc);
