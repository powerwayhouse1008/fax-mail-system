- Create users table used by app/lib/server/user-store.ts
create extension if not exists pgcrypto;

create table if not exists public.users (
  id text primary key default gen_random_uuid()::text,
  username text not null unique,
  password_hash text not null,
  name text,
  created_at timestamptz not null default now()
);

-- Hash password with bcrypt (bf)
create or replace function public.hash_password(plain_password text)
returns text
language sql
security definer
as $$
  select crypt(plain_password, gen_salt('bf', 10));
$$;

-- Verify password against stored bcrypt hash
create or replace function public.verify_password(plain_password text, stored_hash text)
returns boolean
language sql
security definer
as $$
  select crypt(plain_password, stored_hash) = stored_hash;
$$;

revoke all on function public.hash_password(text) from public;
revoke all on function public.verify_password(text, text) from public;
grant execute on function public.hash_password(text) to service_role;
grant execute on function public.verify_password(text, text) to service_role;
create table if not exists public.data_spider_contacts (
  id text primary key default gen_random_uuid()::text,
  company_name text,
  person_name text,
  address text,
  phone text,
  fax text,
  email text,
  website_url text,
  source_url text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_spider_contacts_fax_idx on public.data_spider_contacts (fax);
create index if not exists data_spider_contacts_email_idx on public.data_spider_contacts (email);
create index if not exists data_spider_contacts_created_at_idx on public.data_spider_contacts (created_at desc);
