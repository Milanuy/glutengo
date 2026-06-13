-- ============================================================
-- GlutenGo — RLS + Score functions
-- Ejecutar después de 0001_initial.sql
-- ============================================================

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table establishments enable row level security;
alter table establishment_photos enable row level security;
alter table visits enable row level security;
alter table favorites enable row level security;
alter table score_history enable row level security;

create or replace function is_moderator()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('moderator','admin') and not is_banned
  );
$$;

-- PROFILES
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'user');

-- ESTABLISHMENTS
create policy "est_select" on establishments for select
  using (is_active or is_moderator());
create policy "est_write" on establishments for all
  using (is_moderator());

create policy "est_photos_select" on establishment_photos for select using (true);
create policy "est_photos_write" on establishment_photos for all
  using (is_moderator());

-- VISITS
create policy "visits_select" on visits for select
  using (status = 'approved' or user_id = auth.uid() or is_moderator());
create policy "visits_insert" on visits for insert
  with check (
    user_id = auth.uid()
    and not exists (select 1 from profiles where id = auth.uid() and is_banned)
  );
create policy "visits_moderate" on visits for update
  using (is_moderator());

-- FAVORITES
create policy "fav_all_own" on favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- SCORE_HISTORY
create policy "score_hist_select" on score_history for select using (true);

-- ============================================================
-- FUNCIÓN RECOMPUTE_SCORE
-- ============================================================
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
    continue when r.rn > 3;
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

  -- Bayesiano: prior m=0.65, C=5
  v_score := round(100 * (5 * 0.65 + v_sum_wq) / (5 + v_sum_w), 2);

  -- Overrides
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

-- ============================================================
-- TRIGGER: recalcular score al aprobar visita
-- ============================================================
create or replace function on_visit_approved()
returns trigger language plpgsql security definer as $$
begin
  perform recompute_score(new.establishment_id);
  update profiles set visits_count = visits_count + 1 where id = new.user_id;
  return new;
end $$;

create trigger trg_visit_approved
  after update of status on visits
  for each row
  when (new.status = 'approved' and old.status = 'pending')
  execute function on_visit_approved();

-- ============================================================
-- FUNCIONES RPC (llamadas desde el cliente)
-- ============================================================

-- Búsqueda por proximidad geográfica
create or replace function nearby_establishments(
  lat double precision,
  lng double precision,
  radius_m int default 2000
)
returns table (
  id uuid, name text, slug text, category establishment_category,
  score numeric, score_band score_band, address text, neighborhood text,
  is_dedicated_gf boolean, lat double precision, lng double precision
)
language sql stable as $$
  select id, name, slug, category, score, score_band,
         address, neighborhood, is_dedicated_gf,
         st_y(location::geometry) as lat,
         st_x(location::geometry) as lng
  from establishments
  where is_active
    and st_dwithin(location, st_point(lng, lat)::geography, radius_m)
  order by st_distance(location, st_point(lng, lat)::geography);
$$;

-- Búsqueda por nombre (tolerante a typos)
create or replace function search_establishments(query text)
returns table (
  id uuid, name text, slug text, category establishment_category,
  score numeric, score_band score_band, neighborhood text,
  is_dedicated_gf boolean, similarity float
)
language sql stable as $$
  select id, name, slug, category, score, score_band,
         neighborhood, is_dedicated_gf,
         similarity(name, query) as similarity
  from establishments
  where is_active and name % query
  order by similarity(name, query) desc
  limit 20;
$$;

-- ============================================================
-- CRON: decay semanal del score (Supabase tiene pg_cron)
-- ============================================================
-- Descomentar cuando el proyecto esté en producción:
-- select cron.schedule('weekly-score-decay', '0 6 * * 1',
--   $$ select recompute_score(id) from establishments
--      where approved_visits_count > 0 $$);
