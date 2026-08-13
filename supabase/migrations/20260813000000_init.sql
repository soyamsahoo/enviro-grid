-- ============================================================================
-- ENVIROGRID 2.0 — Database Migration
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Requires: PostGIS extension (enabled below).
-- ============================================================================

create extension if not exists postgis;

-- ----------------------------------------------------------------------------
-- cached_environmental_data
-- Server-side cache for aggregated location metrics (15-minute TTL).
-- ----------------------------------------------------------------------------
create table if not exists public.cached_environmental_data (
  id bigint generated always as identity primary key,
  lat double precision not null,
  lon double precision not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  geog geography(Point, 4326)
    generated always as (st_setsrid(st_makepoint(lon, lat), 4326)::geography) stored
);

create index if not exists idx_cached_env_coords
  on public.cached_environmental_data (lat, lon);

create index if not exists idx_cached_env_expiry
  on public.cached_environmental_data (expires_at);

create index if not exists idx_cached_env_geog
  on public.cached_environmental_data using gist (geog);

-- ----------------------------------------------------------------------------
-- species_cache
-- Maps GBIF scientificName -> common name, image URL, and gbif_key.
-- ----------------------------------------------------------------------------
create table if not exists public.species_cache (
  id bigint generated always as identity primary key,
  scientific_name text not null unique,
  common_name text,
  image_url text,
  gbif_key bigint,
  summary_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_species_cache_name
  on public.species_cache (scientific_name);

-- ----------------------------------------------------------------------------
-- user_search_history
-- Tracks queried coordinates and the active persona per search.
-- ----------------------------------------------------------------------------
create table if not exists public.user_search_history (
  id bigint generated always as identity primary key,
  location_name text,
  lat double precision not null,
  lon double precision not null,
  persona text not null,
  persona_health_score numeric,
  searched_at timestamptz not null default now()
);

create index if not exists idx_user_search_history_recent
  on public.user_search_history (searched_at desc);

-- ----------------------------------------------------------------------------
-- RLS: all tables readable by anyone (anon key), writes limited.
-- For a production deployment, scope policies further per your auth model.
-- ----------------------------------------------------------------------------
alter table public.cached_environmental_data enable row level security;
alter table public.species_cache enable row level security;
alter table public.user_search_history enable row level security;

create policy "cached data is publicly readable"
  on public.cached_environmental_data for select
  using (true);

create policy "cached data upsert via service role"
  on public.cached_environmental_data for all
  using (auth.role() = 'service_role');

create policy "species cache is publicly readable"
  on public.species_cache for select
  using (true);

create policy "species cache upsert via service role"
  on public.species_cache for all
  using (auth.role() = 'service_role');

create policy "search history insert by anyone"
  on public.user_search_history for insert
  with check (true);

create policy "search history readable by anyone"
  on public.user_search_history for select
  using (true);

-- ----------------------------------------------------------------------------
-- Helper: nearest cached payload (used to dedupe before refetching).
-- ----------------------------------------------------------------------------
create or replace function public.get_cached_payload(
  target_lat double precision,
  target_lon double precision,
  radius_meters double precision default 1000
)
returns jsonb
language sql stable
as $$
  select payload
  from public.cached_environmental_data
  where st_dwithin(geog, st_setsrid(st_makepoint(target_lon, target_lat), 4326)::geography, radius_meters)
    and expires_at > now()
  order by fetched_at desc
  limit 1;
$$;
