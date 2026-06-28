-- ============================================================
-- GlutenGo — Métricas sociales propias
-- ============================================================
-- Guarda snapshots agregados de canales sociales, por ejemplo
-- números semanales copiados desde Instagram Insights.
-- No guarda datos personales de seguidores ni usuarios.

create table if not exists social_metrics (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'instagram'
    check (channel in ('instagram', 'tiktok', 'facebook', 'otro')),
  metric_date date not null default current_date,
  followers integer not null default 0 check (followers >= 0),
  reach integer not null default 0 check (reach >= 0),
  profile_visits integer not null default 0 check (profile_visits >= 0),
  website_clicks integer not null default 0 check (website_clicks >= 0),
  posts integer not null default 0 check (posts >= 0),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

alter table social_metrics enable row level security;

create index if not exists idx_social_metrics_channel_date
  on social_metrics (channel, metric_date desc, created_at desc);

create index if not exists idx_social_metrics_created
  on social_metrics (created_at desc);
