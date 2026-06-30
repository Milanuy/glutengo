-- ============================================================
-- GlutenGo — Cierre de acceso publico directo a tablas
-- ============================================================
-- La web no consulta tablas de Supabase directamente con anon key:
-- todas las lecturas/escrituras de datos pasan por Netlify Functions
-- usando SUPABASE_SERVICE_ROLE_KEY. Esta migracion evita que alguien
-- con la URL del proyecto y la anon key pueda leer o modificar tablas
-- crudas via PostgREST/RPC.

begin;

-- Mantener service_role como unico rol operativo para tablas publicas.
grant usage on schema public to service_role;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- Evitar que nuevas tablas/secuencias queden expuestas por defecto.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Las RPC de public tampoco deben ser invocables desde la anon key.
-- Esto incluye funciones security definer como recompute_score.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon, authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema public grant execute on functions to service_role;

-- RLS obligatorio en todas las tablas que usa GlutenGo.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'establishments',
    'establishment_photos',
    'visits',
    'favorites',
    'score_history',
    'waitlist',
    'ratings',
    'businesses',
    'analytics_events',
    'business_update_requests',
    'social_metrics',
    'spatial_ref_sys'
  ]
  loop
    if to_regclass('public.' || quote_ident(table_name)) is not null then
      begin
        execute format('alter table public.%I enable row level security', table_name);
        execute format('alter table public.%I force row level security', table_name);
      exception
        when insufficient_privilege then
          -- En Supabase, tablas de extensiones como PostGIS spatial_ref_sys
          -- pueden pertenecer a supabase_admin y no ser alterables desde
          -- el SQL Editor. El acceso a datos de la app ya queda cerrado por
          -- revokes/RLS en las tablas propias.
          raise notice 'Skipping RLS for extension-managed table %.%', 'public', table_name;
      end;
    end if;
  end loop;
end $$;

-- Quitar politicas historicas demasiado amplias. El dato publico se expone
-- desde /api/public-businesses, /api/rating, etc., no desde tablas crudas.
do $$
begin
  if to_regclass('public.profiles') is not null then
    drop policy if exists "profiles_select" on public.profiles;
  end if;

  if to_regclass('public.establishments') is not null then
    drop policy if exists "est_select" on public.establishments;
  end if;

  if to_regclass('public.establishment_photos') is not null then
    drop policy if exists "est_photos_select" on public.establishment_photos;
  end if;

  if to_regclass('public.score_history') is not null then
    drop policy if exists "score_hist_select" on public.score_history;
  end if;
end $$;

commit;
