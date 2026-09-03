-- memo app schema
-- Supabase SQL Editorで実行してください。初期フォルダは作成しません。

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (
    length(btrim(username)) between 3 and 30
    and username !~ '[[:space:]]'
  ),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_unique
on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := lower(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''));
  if requested_username is null
     or length(requested_username) < 3
     or length(requested_username) > 30
     or requested_username ~ '[[:space:]]' then
    requested_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  insert into public.profiles (id, username)
  values (new.id, requested_username)
  on conflict (id) do update set username = excluded.username;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 30),
  color text not null default '#b6ddca'
    check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists folders_user_name_unique
on public.folders (user_id, lower(name));

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  title text not null default '無題のメモ',
  content_html text not null default '',
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_updated_at_idx
on public.notes (user_id, updated_at desc);

create index if not exists notes_user_folder_idx
on public.notes (user_id, folder_id);

create table if not exists public.note_attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check (file_size >= 0),
  created_at timestamptz not null default now()
);

create index if not exists note_attachments_note_idx
on public.note_attachments (note_id);

drop trigger if exists folders_set_updated_at on public.folders;
create trigger folders_set_updated_at
before update on public.folders
for each row execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.folders enable row level security;
alter table public.notes enable row level security;
alter table public.note_attachments enable row level security;
alter table public.profiles enable row level security;

revoke all on public.folders from anon;
revoke all on public.notes from anon;
revoke all on public.note_attachments from anon;
revoke all on public.profiles from anon;

grant select, insert, update, delete
on public.folders, public.notes, public.note_attachments
to authenticated;

grant select on public.profiles to authenticated;

drop policy if exists "Users can select own profile" on public.profiles;
create policy "Users can select own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can select own folders" on public.folders;
create policy "Users can select own folders"
on public.folders for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own folders" on public.folders;
create policy "Users can insert own folders"
on public.folders for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own folders" on public.folders;
create policy "Users can update own folders"
on public.folders for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own folders" on public.folders;
create policy "Users can delete own folders"
on public.folders for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can select own notes" on public.notes;
create policy "Users can select own notes"
on public.notes for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own notes" on public.notes;
create policy "Users can insert own notes"
on public.notes for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1 from public.folders
      where folders.id = notes.folder_id
        and folders.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Users can update own notes" on public.notes;
create policy "Users can update own notes"
on public.notes for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1 from public.folders
      where folders.id = notes.folder_id
        and folders.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Users can delete own notes" on public.notes;
create policy "Users can delete own notes"
on public.notes for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can select own attachments" on public.note_attachments;
create policy "Users can select own attachments"
on public.note_attachments for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own attachments" on public.note_attachments;
create policy "Users can insert own attachments"
on public.note_attachments for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.notes
    where notes.id = note_attachments.note_id
      and notes.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can update own attachments" on public.note_attachments;
create policy "Users can update own attachments"
on public.note_attachments for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own attachments" on public.note_attachments;
create policy "Users can delete own attachments"
on public.note_attachments for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('note-files', 'note-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "Users can upload own note files" on storage.objects;
create policy "Users can upload own note files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'note-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can read own note files" on storage.objects;
create policy "Users can read own note files"
on storage.objects for select to authenticated
using (
  bucket_id = 'note-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can update own note files" on storage.objects;
create policy "Users can update own note files"
on storage.objects for update to authenticated
using (
  bucket_id = 'note-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'note-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can delete own note files" on storage.objects;
create policy "Users can delete own note files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'note-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

do $$
begin
  alter publication supabase_realtime
    add table public.folders, public.notes, public.note_attachments;
exception
  when duplicate_object then null;
end;
$$;
