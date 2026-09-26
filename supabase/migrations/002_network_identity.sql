-- Upgrade path for databases created before cohort identity and private favorites.
alter table public.profiles
  add column if not exists graduation_year smallint not null default 2028
  check (graduation_year between 2020 and 2100);

create table if not exists public.connection_favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, connection_id)
);

alter table public.connection_favorites enable row level security;
revoke all on public.connection_favorites from public, anon, authenticated;
grant all on public.connection_favorites to service_role;
