-- ============================================================
-- GlutenGo — Moderación de fotos en valoraciones
-- ============================================================

alter table ratings
  add column if not exists photo_status text not null default 'pending',
  add column if not exists photo_reviewed_at timestamptz;

alter table ratings
  drop constraint if exists ratings_photo_status_check;

alter table ratings
  add constraint ratings_photo_status_check
  check (photo_status in ('pending', 'approved', 'rejected'));

create index if not exists idx_ratings_photo_status_created
  on ratings (photo_status, created_at desc)
  where photo_url is not null;

update ratings
set photo_status = 'pending'
where photo_url is not null
  and photo_status not in ('pending', 'approved', 'rejected');
