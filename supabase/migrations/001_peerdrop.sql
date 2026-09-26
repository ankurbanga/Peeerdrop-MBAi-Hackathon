-- Peerdrop application schema. All application data is accessed through the
-- server's service-role client after it verifies the caller with Supabase Auth.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  avatar_url text,
  graduation_year smallint not null default 2028 check (graduation_year between 2020 and 2100),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object')
    check (details - 'hometown' - 'industry' - 'hobbies' - 'movies' - 'funFact' - 'relationshipStatus' - 'contact' = '{}'::jsonb)
    check (not (details ? 'hobbies') or (jsonb_typeof(details->'hobbies') = 'array' and jsonb_array_length(details->'hobbies') <= 20))
    check (not (details ? 'movies') or (jsonb_typeof(details->'movies') = 'array' and jsonb_array_length(details->'movies') <= 20))
    check (not (details ? 'contact') or (
      jsonb_typeof(details->'contact') = 'object'
      and (details->'contact') - 'phone' - 'email' - 'instagram' - 'linkedin' = '{}'::jsonb
    )),
  default_share_fields text[] not null default '{}'::text[]
    check (default_share_fields <@ array['hometown', 'industry', 'hobbies', 'movies', 'funFact', 'relationshipStatus', 'phone', 'email', 'instagram', 'linkedin', 'classes', 'clubs']::text[]),
  graph_visible boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_demo_auth_owner check (is_demo or auth_user_id is not null)
);

create table if not exists public.affiliations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('class', 'club')),
  name text not null check (length(btrim(name)) between 1 and 200),
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

create table if not exists public.profile_affiliations (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  affiliation_id uuid not null references public.affiliations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, affiliation_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  venue text not null check (length(btrim(venue)) between 1 and 200),
  external_url text check (external_url is null or external_url ~ '^https://'),
  source text not null check (source in ('partiful', 'campusgroups', 'curated')),
  tags text[] not null default '{}'::text[],
  affiliation_id uuid references public.affiliations(id) on delete set null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.event_interests (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  share_with_connections boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  person_a uuid not null references public.profiles(id) on delete cascade,
  person_b uuid not null references public.profiles(id) on delete cascade,
  snapshot_a jsonb not null check (jsonb_typeof(snapshot_a) = 'object'),
  snapshot_b jsonb not null check (jsonb_typeof(snapshot_b) = 'object'),
  met_at timestamptz not null default now(),
  venue text,
  event_id uuid references public.events(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint connections_distinct_people check (person_a <> person_b),
  constraint connections_canonical_pair check (person_a < person_b),
  unique (person_a, person_b)
);

create table if not exists public.connection_favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, connection_id)
);

create table if not exists public.exchanges (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash) between 32 and 128),
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'requested', 'accepted', 'cancelled')),
  expires_at timestamptz not null,
  initiator_snapshot jsonb not null check (jsonb_typeof(initiator_snapshot) = 'object'),
  receiver_snapshot jsonb check (receiver_snapshot is null or jsonb_typeof(receiver_snapshot) = 'object'),
  venue text,
  event_id uuid references public.events(id) on delete set null,
  connection_id uuid references public.connections(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exchanges_receiver_not_initiator check (receiver_id is null or receiver_id <> initiator_id),
  constraint exchanges_state_shape check (
    (status = 'open' and receiver_id is null and receiver_snapshot is null and connection_id is null)
    or (status = 'requested' and receiver_id is not null and receiver_snapshot is not null and connection_id is null)
    or (status = 'accepted' and receiver_id is not null and receiver_snapshot is not null and connection_id is not null)
    or (status = 'cancelled' and connection_id is null)
  )
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  visibility text not null check (visibility in ('private', 'shared')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The API's suggested venue list is catalog data, not a location history.
create table if not exists public.venue_labels (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (length(btrim(label)) between 1 and 200),
  is_demo boolean not null default true
);

create index if not exists exchanges_initiator_status_idx on public.exchanges (initiator_id, status);
create index if not exists exchanges_receiver_status_idx on public.exchanges (receiver_id, status);
create index if not exists connections_person_a_idx on public.connections (person_a);
create index if not exists connections_person_b_idx on public.connections (person_b);
create index if not exists notes_connection_idx on public.notes (connection_id, created_at desc);
create unique index if not exists notes_one_private_per_author_idx
  on public.notes (connection_id, author_id) where visibility = 'private';
create index if not exists events_starts_at_idx on public.events (starts_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_exchange_snapshots()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.initiator_snapshot is distinct from old.initiator_snapshot then
    raise exception using message = 'CONFLICT', detail = 'Exchange snapshots are immutable';
  end if;
  if old.receiver_snapshot is not null and new.receiver_snapshot is distinct from old.receiver_snapshot then
    raise exception using message = 'CONFLICT', detail = 'Exchange snapshots are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.protect_connection_snapshots()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.snapshot_a is distinct from old.snapshot_a or new.snapshot_b is distinct from old.snapshot_b then
    raise exception using message = 'CONFLICT', detail = 'Connection snapshots are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
drop trigger if exists exchanges_touch_updated_at on public.exchanges;
create trigger exchanges_touch_updated_at before update on public.exchanges
for each row execute function public.touch_updated_at();
drop trigger if exists exchanges_protect_snapshots on public.exchanges;
create trigger exchanges_protect_snapshots before update on public.exchanges
for each row execute function public.protect_exchange_snapshots();
drop trigger if exists connections_protect_snapshots on public.connections;
create trigger connections_protect_snapshots before update on public.connections
for each row execute function public.protect_connection_snapshots();
drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at before update on public.notes
for each row execute function public.touch_updated_at();

-- Atomically claim a QR invite. `p_snapshot` is the receiver card already
-- generated and allowlisted by the authenticated application server.
create or replace function public.request_exchange(
  p_token_hash text,
  p_actor uuid,
  p_snapshot jsonb
)
returns public.exchanges
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_exchange public.exchanges%rowtype;
begin
  select * into v_exchange
  from public.exchanges
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception using message = 'NOT_FOUND';
  end if;
  if p_actor is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception using message = 'CONFLICT', detail = 'A receiver profile and object snapshot are required';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor) then
    raise exception using message = 'NOT_FOUND';
  end if;
  if p_actor = v_exchange.initiator_id then
    raise exception using message = 'CONFLICT', detail = 'An invite cannot be claimed by its initiator';
  end if;

  -- Retrying the receiver's own request is safe even after acceptance/expiry.
  if v_exchange.receiver_id = p_actor and v_exchange.status in ('requested', 'accepted') then
    return v_exchange;
  end if;
  if v_exchange.status = 'cancelled' then
    raise exception using message = 'CONFLICT';
  end if;
  if v_exchange.status <> 'open' then
    raise exception using message = 'CONFLICT';
  end if;
  if v_exchange.expires_at <= clock_timestamp() then
    raise exception using message = 'EXPIRED';
  end if;

  update public.exchanges
  set receiver_id = p_actor,
      receiver_snapshot = p_snapshot,
      status = 'requested'
  where id = v_exchange.id
  returning * into v_exchange;
  return v_exchange;
end;
$$;

-- Complete reciprocal consent. Existing pairs are returned without changing
-- their original snapshots, meeting context, or notes.
create or replace function public.accept_exchange(
  p_exchange_id uuid,
  p_actor uuid
)
returns public.exchanges
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_exchange public.exchanges%rowtype;
  v_a uuid;
  v_b uuid;
  v_snapshot_a jsonb;
  v_snapshot_b jsonb;
  v_connection_id uuid;
begin
  select * into v_exchange
  from public.exchanges
  where id = p_exchange_id
  for update;

  if not found then
    raise exception using message = 'NOT_FOUND';
  end if;
  if p_actor is null or p_actor <> v_exchange.initiator_id then
    raise exception using message = 'FORBIDDEN';
  end if;
  if v_exchange.status = 'accepted' then
    return v_exchange;
  end if;
  if v_exchange.status = 'cancelled' then
    raise exception using message = 'CONFLICT';
  end if;
  if v_exchange.expires_at <= clock_timestamp() then
    raise exception using message = 'EXPIRED';
  end if;
  if v_exchange.status <> 'requested' or v_exchange.receiver_id is null then
    raise exception using message = 'CONFLICT';
  end if;

  if v_exchange.initiator_id < v_exchange.receiver_id then
    v_a := v_exchange.initiator_id;
    v_b := v_exchange.receiver_id;
    v_snapshot_a := v_exchange.initiator_snapshot;
    v_snapshot_b := v_exchange.receiver_snapshot;
  else
    v_a := v_exchange.receiver_id;
    v_b := v_exchange.initiator_id;
    v_snapshot_a := v_exchange.receiver_snapshot;
    v_snapshot_b := v_exchange.initiator_snapshot;
  end if;

  insert into public.connections (person_a, person_b, snapshot_a, snapshot_b, met_at, venue, event_id)
  values (v_a, v_b, v_snapshot_a, v_snapshot_b, clock_timestamp(), v_exchange.venue, v_exchange.event_id)
  on conflict (person_a, person_b) do nothing;

  select id into v_connection_id
  from public.connections
  where person_a = v_a and person_b = v_b;

  update public.exchanges
  set status = 'accepted', connection_id = v_connection_id
  where id = v_exchange.id
  returning * into v_exchange;
  return v_exchange;
end;
$$;

-- Either participant can cancel before acceptance. Repeating a cancellation
-- by a participant is idempotent; acceptance and cancellation serialize on
-- this same exchange row.
create or replace function public.cancel_exchange(
  p_exchange_id uuid,
  p_actor uuid
)
returns public.exchanges
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_exchange public.exchanges%rowtype;
begin
  select * into v_exchange
  from public.exchanges
  where id = p_exchange_id
  for update;

  if not found then
    raise exception using message = 'NOT_FOUND';
  end if;
  if p_actor is null or p_actor is distinct from v_exchange.initiator_id and p_actor is distinct from v_exchange.receiver_id then
    raise exception using message = 'FORBIDDEN';
  end if;
  if v_exchange.status = 'accepted' then
    raise exception using message = 'CONFLICT';
  end if;
  if v_exchange.status = 'cancelled' then
    return v_exchange;
  end if;

  update public.exchanges
  set status = 'cancelled'
  where id = v_exchange.id
  returning * into v_exchange;
  return v_exchange;
end;
$$;

-- No browser role can access application tables or invoke these definer RPCs.
alter table public.profiles enable row level security;
alter table public.affiliations enable row level security;
alter table public.profile_affiliations enable row level security;
alter table public.events enable row level security;
alter table public.event_interests enable row level security;
alter table public.exchanges enable row level security;
alter table public.connections enable row level security;
alter table public.connection_favorites enable row level security;
alter table public.notes enable row level security;
alter table public.venue_labels enable row level security;

revoke all on public.profiles, public.affiliations, public.profile_affiliations,
  public.events, public.event_interests, public.exchanges, public.connections,
  public.connection_favorites, public.notes, public.venue_labels from public, anon, authenticated;
grant all on public.profiles, public.affiliations, public.profile_affiliations,
  public.events, public.event_interests, public.exchanges, public.connections,
  public.connection_favorites, public.notes, public.venue_labels to service_role;

revoke all on function public.request_exchange(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.accept_exchange(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_exchange(uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_exchange(text, uuid, jsonb) to service_role;
grant execute on function public.accept_exchange(uuid, uuid) to service_role;
grant execute on function public.cancel_exchange(uuid, uuid) to service_role;

-- Stable, fictional catalog rows for the demonstration. Contact fixtures are
-- created by the demo fixture service, not by this schema migration.
insert into public.affiliations (id, kind, name, is_demo) values
  ('10000000-0000-4000-8000-000000000001', 'class', 'Marketing Strategy', true),
  ('10000000-0000-4000-8000-000000000002', 'class', 'Data Analytics', true),
  ('10000000-0000-4000-8000-000000000003', 'class', 'Entrepreneurship Lab', true),
  ('10000000-0000-4000-8000-000000000011', 'club', 'Healthcare Club', true),
  ('10000000-0000-4000-8000-000000000012', 'club', 'Kellogg Tech Club', true),
  ('10000000-0000-4000-8000-000000000013', 'club', 'Running Club', true)
on conflict (kind, name) do update set is_demo = excluded.is_demo;

insert into public.venue_labels (id, label, is_demo) values
  ('20000000-0000-4000-8000-000000000001', 'Global Hub', true),
  ('20000000-0000-4000-8000-000000000002', 'Kellogg Global Hub Café', true),
  ('20000000-0000-4000-8000-000000000003', 'Ryan Fieldhouse', true),
  ('20000000-0000-4000-8000-000000000004', 'The Garage at Northwestern', true)
on conflict (label) do update set is_demo = excluded.is_demo;

insert into public.events (id, title, starts_at, venue, external_url, source, tags, affiliation_id, is_demo) values
  ('30000000-0000-4000-8000-000000000001', 'Kellogg Fall Social', '2026-10-08 23:00:00+00', 'Global Hub', null, 'curated', array['social', 'community'], null, true),
  ('30000000-0000-4000-8000-000000000002', 'Healthcare Careers Mixer', '2026-10-14 23:30:00+00', 'Kellogg Global Hub Café', null, 'curated', array['healthcare', 'careers'], '10000000-0000-4000-8000-000000000011', true),
  ('30000000-0000-4000-8000-000000000003', 'Tech Club Demo Night', '2026-10-21 23:00:00+00', 'The Garage at Northwestern', null, 'curated', array['technology', 'startups'], '10000000-0000-4000-8000-000000000012', true),
  ('30000000-0000-4000-8000-000000000004', 'Lakeshore Running Meetup', '2026-11-01 14:00:00+00', 'Ryan Fieldhouse', null, 'curated', array['fitness', 'social'], '10000000-0000-4000-8000-000000000013', true)
on conflict (id) do update set
  title = excluded.title,
  starts_at = excluded.starts_at,
  venue = excluded.venue,
  external_url = excluded.external_url,
  source = excluded.source,
  tags = excluded.tags,
  affiliation_id = excluded.affiliation_id,
  is_demo = excluded.is_demo;
