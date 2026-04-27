
-- Enums
create type public.app_role as enum ('admin', 'user');
create type public.research_category as enum ('drugs', 'disease', 'discovery');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  username text unique not null,
  country text not null default '',
  phone text default '',
  avatar_url text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles viewable by all authenticated"
  on public.profiles for select to authenticated using (true);
create policy "Users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- User Roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users can view own roles"
  on public.user_roles for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles"
  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Research
create table public.research (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  header_image_url text default '',
  category public.research_category not null,
  section text default '',
  content_html text not null default '',
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.research enable row level security;

create policy "Authenticated read research"
  on public.research for select to authenticated using (true);
create policy "Admins write research"
  on public.research for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update research"
  on public.research for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete research"
  on public.research for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Likes
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_id uuid not null references public.research(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, research_id)
);
alter table public.likes enable row level security;
create policy "Likes readable" on public.likes for select to authenticated using (true);
create policy "Users like" on public.likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Users unlike" on public.likes for delete to authenticated using (auth.uid() = user_id);

-- Comments
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_id uuid not null references public.research(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;
create policy "Comments readable" on public.comments for select to authenticated using (true);
create policy "Users comment" on public.comments for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete own comments" on public.comments for delete to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

-- Comment likes
create table public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, comment_id)
);
alter table public.comment_likes enable row level security;
create policy "Comment likes readable" on public.comment_likes for select to authenticated using (true);
create policy "Users like comment" on public.comment_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Users unlike comment" on public.comment_likes for delete to authenticated using (auth.uid() = user_id);

-- Auto-create profile + default 'user' role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, username, country, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 6)),
    coalesce(new.raw_user_meta_data->>'country', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage buckets
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
insert into storage.buckets (id, name, public) values ('research-images', 'research-images', true);

create policy "Avatars publicly readable" on storage.objects for select using (bucket_id = 'avatars');
create policy "Users upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Research images publicly readable" on storage.objects for select using (bucket_id = 'research-images');
create policy "Admins upload research images" on storage.objects for insert to authenticated
  with check (bucket_id = 'research-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update research images" on storage.objects for update to authenticated
  using (bucket_id = 'research-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete research images" on storage.objects for delete to authenticated
  using (bucket_id = 'research-images' and public.has_role(auth.uid(), 'admin'));
