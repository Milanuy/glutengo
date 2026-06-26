-- ============================================================
-- GlutenGo — Analítica propia first-party
-- ============================================================
-- Guarda eventos anónimos de producto. No almacena IP, email,
-- nombre de usuario ni identificadores de autenticación.

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  page text,
  path text,
  slug text,
  session_id text,
  referrer text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_events_event_type_check check (
    event_type in (
      'page_view',
      'place_view',
      'outbound_click',
      'cta_click',
      'filter_use',
      'search_use',
      'map_interaction',
      'rating_start',
      'rating_submit',
      'business_form_submit',
      'mp_click',
      'share_click'
    )
  )
);

create index if not exists idx_analytics_events_created
  on analytics_events (created_at desc);

create index if not exists idx_analytics_events_type_created
  on analytics_events (event_type, created_at desc);

create index if not exists idx_analytics_events_slug_created
  on analytics_events (slug, created_at desc)
  where slug is not null;

create index if not exists idx_analytics_events_session_created
  on analytics_events (session_id, created_at desc)
  where session_id is not null;

create index if not exists idx_analytics_events_metadata
  on analytics_events using gin (metadata);

alter table analytics_events enable row level security;
