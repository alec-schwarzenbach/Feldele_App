-- Hunting lodge app – Supabase schema.
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.

-- ───────────── Profiles (one per login) ─────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'car_keeper')),
  family text,
  created_at timestamptz not null default now()
);

-- Exactly one owner (only they can hand out roles) and at most one car keeper
-- (the only person who gets car notifications).
create unique index one_owner on public.profiles (role) where role = 'owner';
create unique index one_car_keeper on public.profiles (role) where role = 'car_keeper';

-- Create a profile automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin'))
$$;

-- ───────────── Settings (single row) ─────────────
create table public.settings (
  id int primary key default 1 check (id = 1),
  free_cancel_months int not null default 4,
  currency text not null default 'EUR',
  lodge_name text not null default 'Our Hunting Lodge',
  lodge_lat double precision not null default 47.505,
  lodge_lng double precision not null default 14.0
);
insert into public.settings default values;

-- ───────────── Rooms ─────────────
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  beds int not null default 2,
  created_at timestamptz not null default now()
);

-- ───────────── Reservations ─────────────
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  start date not null,
  "end" date not null check ("end" > start),
  people int not null check (people > 0),
  room_ids uuid[] not null default '{}',
  occasion text,
  note text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_at timestamptz,
  late_cancel boolean,
  created_at timestamptz not null default now()
);

-- Decide on the server whether a cancellation is free or late.
create function public.on_reservation_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare months int;
begin
  if new.status = 'cancelled' and old.status = 'active' then
    select free_cancel_months into months from public.settings where id = 1;
    new.cancelled_at := now();
    new.late_cancel := current_date > (old.start - make_interval(months => months))::date;
  end if;
  return new;
end $$;

create trigger reservation_cancel before update on public.reservations
  for each row execute function public.on_reservation_cancel();

-- ───────────── Car bookings + notifications ─────────────
create table public.car_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  reservation_id uuid references public.reservations on delete cascade,
  start date not null,
  "end" date not null check ("end" >= start),
  note text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.notify_car_keepers() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select name into who from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, title, body)
  select id,
         'Car needed: ' || who,
         who || ' needs the car from ' || to_char(new.start, 'DD.MM.YYYY') || ' to ' || to_char(new."end", 'DD.MM.YYYY') || '.'
           || coalesce(' Note: ' || new.note, '')
  from public.profiles where role = 'car_keeper';
  return new;
end $$;

create trigger car_booking_notify after insert on public.car_bookings
  for each row execute function public.notify_car_keepers();

-- ───────────── Fishing ─────────────
create table public.catches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  species text not null,
  length_cm numeric not null,
  weight_kg numeric,
  lat double precision not null,
  lng double precision not null,
  caught_at date not null,
  bait text,
  note text,
  photo_url text,
  created_at timestamptz not null default now()
);

-- ───────────── Info board ─────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  category text not null check (category in ('tip', 'trip', 'review', 'restaurant', 'other')),
  title text not null,
  body text not null,
  rating int check (rating between 1 and 5),
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ───────────── Costs ─────────────
create table public.costs (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  category text not null check (category in ('rent', 'electricity', 'water', 'supplies', 'other')),
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

-- ───────────── Row level security ─────────────
-- Every signed-in member can read everything; you can change your own rows;
-- admins can change anything. Settings and rooms are admin-only to edit; costs are admin-only to see.
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.rooms enable row level security;
alter table public.reservations enable row level security;
alter table public.car_bookings enable row level security;
alter table public.notifications enable row level security;
alter table public.catches enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.costs enable row level security;

create policy "read" on public.profiles for select to authenticated using (true);
create policy "edit own or admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin());
-- Only the owner can change roles.
create function public.guard_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null in the Supabase SQL editor, where you set up the owner.
  if new.role <> old.role and auth.uid() is not null then
    if not exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
      raise exception 'Only the owner can change roles';
    end if;
    if new.role = 'owner' or old.role = 'owner' then
      raise exception 'The owner role cannot be moved in the app';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_role();

do $$
declare t text;
begin
  foreach t in array array['settings', 'rooms'] loop
    execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  -- Costs (rent, water, electricity…): only admins can see or change them.
  create policy "admin only" on public.costs for all to authenticated using (public.is_admin()) with check (public.is_admin());
  foreach t in array array['reservations', 'car_bookings', 'catches', 'posts', 'comments'] loop
    execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "insert own" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "update own" on public.%I for update to authenticated using (user_id = auth.uid() or public.is_admin())', t);
    execute format('create policy "delete own" on public.%I for delete to authenticated using (user_id = auth.uid() or public.is_admin())', t);
  end loop;
end $$;

create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark own read" on public.notifications for update to authenticated using (user_id = auth.uid());

-- ───────────── Photo storage ─────────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
create policy "members upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────── Starter rooms (edit in the app under Settings) ─────────────
insert into public.rooms (name, beds) values
  ('Big bedroom', 2), ('Bunk room', 4), ('Attic', 3), ('Living room sofa', 2);

-- After you create your own account in the app, make yourself the owner
-- (you can then make others admin from the Profile page):
--   update public.profiles set role = 'owner' where email = 'you@example.com';
-- And mark Günther as car keeper once he has signed up:
--   update public.profiles set role = 'car_keeper' where email = 'guenther@example.com';
