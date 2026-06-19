-- ============================================================
-- GlutenGo — Fotos opcionales en valoraciones
-- ============================================================

alter table ratings
  add column if not exists photo_url text,
  add column if not exists photo_path text;

create index if not exists idx_ratings_photo_path on ratings (photo_path)
  where photo_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rating-photos',
  'rating-photos',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
