-- ============================================================
-- GlutenGo — Tablas usadas por la versión Netlify/static site
-- Ejecutar después de 0001_initial.sql y 0002_rls_and_score.sql
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- WAITLIST / ACTIVACIÓN POR EMAIL
-- ============================================================
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

alter table waitlist enable row level security;

create index if not exists idx_waitlist_token on waitlist (token);
create index if not exists idx_waitlist_created_at on waitlist (created_at desc);

-- ============================================================
-- RATINGS SIMPLES DE LA WEB ACTUAL
-- ============================================================
create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  slug text not null,
  score int not null check (score between 1 and 5),
  comentario text check (char_length(comentario) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, slug)
);

alter table ratings enable row level security;

create index if not exists idx_ratings_slug_created_at on ratings (slug, created_at desc);
create index if not exists idx_ratings_email on ratings (email);

create or replace function touch_ratings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_ratings_updated_at on ratings;
create trigger trg_ratings_updated_at
  before update on ratings
  for each row execute function touch_ratings_updated_at();

-- ============================================================
-- SOLICITUDES DE NEGOCIOS / ADMIN
-- ============================================================
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'mixto' check (tipo in ('exclusivo', 'mixto')),
  categoria text not null default 'restaurante',
  direccion text,
  barrio text,
  email text not null,
  telefono text,
  plan text not null default 'basico' check (plan in ('basico', 'verificado', 'certificado')),
  mensaje text check (char_length(mensaje) <= 1000),
  status text not null default 'pending' check (
    status in ('pending', 'pending_payment', 'active', 'rejected', 'expired')
  ),
  position int not null default 999,
  admin_notes text,
  mp_payment_id text,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table businesses enable row level security;

create index if not exists idx_businesses_status_position on businesses (status, position, created_at desc);
create index if not exists idx_businesses_email_created_at on businesses (email, created_at desc);
create index if not exists idx_businesses_mp_payment_id on businesses (mp_payment_id);

create or replace function touch_businesses_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_businesses_updated_at on businesses;
create trigger trg_businesses_updated_at
  before update on businesses
  for each row execute function touch_businesses_updated_at();
