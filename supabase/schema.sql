-- Ev Stok Mobile — YENİ Supabase projesi için şema
-- Eski ev-stok veritabanına ASLA uygulamayın. Ayrı bir proje oluşturun.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  needed_qty numeric not null default 1,
  current_qty numeric not null default 0,
  unit text not null default 'adet',
  due_date date not null,
  renewal_days int,
  purchased boolean not null default false,
  purchased_place_id text,
  purchased_place_label text,
  notes text not null default '',
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_family_due_idx on public.items (family_id, due_date);
create index if not exists family_members_user_idx on public.family_members (user_id);

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.items enable row level security;

create or replace function public.is_family_member(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid and user_id = auth.uid()
  );
$$;

create or replace function public.join_family_by_invite(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli';
  end if;

  select id into fid
  from public.families
  where invite_code = upper(trim(code));

  if fid is null then
    raise exception 'Davet kodu bulunamadı';
  end if;

  if exists (
    select 1 from public.family_members where user_id = auth.uid()
  ) then
    raise exception 'Zaten bir ailedesiniz';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (fid, auth.uid(), 'member');

  return fid;
end;
$$;

grant execute on function public.join_family_by_invite(text) to authenticated;

create policy "profiles read own or family"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.family_members me
      join public.family_members other on other.family_id = me.family_id
      where me.user_id = auth.uid() and other.user_id = profiles.id
    )
  );

create policy "profiles insert own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles update own"
  on public.profiles for update
  using (id = auth.uid());

create policy "families select member"
  on public.families for select
  using (public.is_family_member(id));

create policy "families insert owner"
  on public.families for insert
  with check (created_by = auth.uid());

create policy "families update owner"
  on public.families for update
  using (
    exists (
      select 1 from public.family_members
      where family_id = id and user_id = auth.uid() and role = 'owner'
    )
  );

create policy "members select family"
  on public.family_members for select
  using (public.is_family_member(family_id));

create policy "members insert self"
  on public.family_members for insert
  with check (user_id = auth.uid());

create policy "members delete self"
  on public.family_members for delete
  using (user_id = auth.uid());

create policy "members delete by owner"
  on public.family_members for delete
  using (
    exists (
      select 1 from public.family_members own
      where own.family_id = family_members.family_id
        and own.user_id = auth.uid()
        and own.role = 'owner'
    )
    and user_id <> auth.uid()
  );

create policy "items select family"
  on public.items for select
  using (public.is_family_member(family_id));

create policy "items insert family"
  on public.items for insert
  with check (public.is_family_member(family_id) and created_by = auth.uid());

create policy "items update family"
  on public.items for update
  using (public.is_family_member(family_id));

create policy "items delete family"
  on public.items for delete
  using (public.is_family_member(family_id));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'kullanici'), '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
