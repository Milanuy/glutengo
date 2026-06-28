-- ============================================================
-- GlutenGo — Portal de locales
-- ============================================================
-- Los locales pueden proponer cambios desde su cuenta Google.
-- Nada se publica automaticamente: cada propuesta queda pendiente
-- hasta que GlutenGo la aprueba desde admin.

create table if not exists business_update_requests (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references businesses(id) on delete cascade,
  owner_email text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

alter table business_update_requests enable row level security;

create index if not exists idx_business_update_requests_status_created
  on business_update_requests (status, created_at desc);

create index if not exists idx_business_update_requests_business_created
  on business_update_requests (business_id, created_at desc);

create index if not exists idx_business_update_requests_owner_created
  on business_update_requests (owner_email, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-assets',
  'business-assets',
  true,
  3145728,
  array['image/jpeg','image/png','image/webp','image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
