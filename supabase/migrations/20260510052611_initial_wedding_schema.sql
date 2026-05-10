create extension if not exists pgcrypto;

create schema if not exists api;
create schema if not exists private;

revoke all on schema public from public;
revoke all on schema api from public;
revoke all on schema private from public;
grant usage on schema api to anon, authenticated;

alter default privileges in schema public
  revoke select, insert, update, delete on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema api
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private
  revoke select, insert, update, delete on tables from public, anon, authenticated;
alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated;

drop function if exists public.submit_guest_rsvp(uuid, text, integer, text, text, text, text);
drop function if exists public.get_guest_by_invite_code(uuid);
drop function if exists public.submit_group_rsvp(uuid, jsonb);
drop function if exists public.get_group_by_invite_code(uuid);
drop table if exists public.wedding_group_members;
drop table if exists public.wedding_groups;
drop table if exists public.wedding_guests;

create table if not exists private.wedding_groups (
  id uuid primary key default gen_random_uuid(),
  invite_code uuid not null unique default gen_random_uuid(),
  group_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.wedding_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references private.wedding_groups(id) on delete cascade,
  full_name text not null,
  display_order integer not null default 0,
  rsvp_status text check (rsvp_status in ('accepted', 'declined')),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 50),
  notes text check (notes is null or char_length(notes) <= 2000),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wedding_group_members_group_id_display_order_idx
  on private.wedding_group_members (group_id, display_order, full_name);

create table if not exists private.rsvp_rate_limits (
  id bigint generated always as identity primary key,
  action text not null,
  ip inet not null,
  invite_code uuid,
  requested_at timestamptz not null default now()
);

create index if not exists rsvp_rate_limits_ip_action_requested_at_idx
  on private.rsvp_rate_limits (ip, action, requested_at desc);

create index if not exists rsvp_rate_limits_invite_action_requested_at_idx
  on private.rsvp_rate_limits (invite_code, action, requested_at desc)
  where invite_code is not null;

alter table private.wedding_groups enable row level security;
alter table private.wedding_group_members enable row level security;
alter table private.rsvp_rate_limits enable row level security;

revoke all on private.wedding_groups from public, anon, authenticated;
revoke all on private.wedding_group_members from public, anon, authenticated;
revoke all on private.rsvp_rate_limits from public, anon, authenticated;

create or replace function private.get_request_ip()
returns inet
language sql
stable
set search_path = private
as $$
  select coalesce(
    nullif(
      trim(split_part(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ',', 1)),
      ''
    )::inet,
    '0.0.0.0'::inet
  );
$$;

create or replace function private.check_rsvp_rate_limit(
  rate_action text,
  lookup_invite_code uuid,
  max_ip_requests integer,
  ip_window interval,
  max_invite_requests integer,
  invite_window interval
)
returns void
language plpgsql
security definer
set search_path = private
as $$
declare
  request_ip inet := private.get_request_ip();
  ip_request_count integer;
  invite_request_count integer;
begin
  delete from private.rsvp_rate_limits
  where requested_at < now() - interval '1 day';

  select count(*)
    into ip_request_count
  from private.rsvp_rate_limits
  where action = rate_action
    and ip = request_ip
    and requested_at > now() - ip_window;

  if ip_request_count >= max_ip_requests then
    raise exception 'Too many RSVP requests. Please wait a few minutes and try again.';
  end if;

  if lookup_invite_code is not null and max_invite_requests is not null then
    select count(*)
      into invite_request_count
    from private.rsvp_rate_limits
    where action = rate_action
      and invite_code = lookup_invite_code
      and requested_at > now() - invite_window;

    if invite_request_count >= max_invite_requests then
      raise exception 'Too many RSVP requests for this invitation. Please wait a few minutes and try again.';
    end if;
  end if;

  insert into private.rsvp_rate_limits (action, ip, invite_code)
  values (rate_action, request_ip, lookup_invite_code);
end;
$$;

create or replace function api.get_group_by_invite_code(lookup_invite_code uuid)
returns table (
  group_name text,
  members jsonb
)
language sql
security definer
set search_path = api, private
as $$
  select private.check_rsvp_rate_limit(
    'lookup',
    lookup_invite_code,
    30,
    interval '10 minutes',
    100,
    interval '1 hour'
  );

  select
    wedding_groups.group_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'member_id', wedding_group_members.id,
          'full_name', wedding_group_members.full_name,
          'rsvp_status', wedding_group_members.rsvp_status
        )
        order by wedding_group_members.display_order, wedding_group_members.full_name
      ) filter (where wedding_group_members.id is not null),
      '[]'::jsonb
    ) as members
  from private.wedding_groups
  left join private.wedding_group_members
    on wedding_group_members.group_id = wedding_groups.id
  where wedding_groups.invite_code = lookup_invite_code
  group by wedding_groups.id, wedding_groups.group_name
  limit 1;
$$;

create or replace function api.submit_group_rsvp(
  lookup_invite_code uuid,
  member_responses jsonb
)
returns void
language plpgsql
security definer
set search_path = api, private
as $$
declare
  target_group_id uuid;
  response jsonb;
  response_member_id uuid;
  response_status text;
begin
  perform private.check_rsvp_rate_limit(
    'submit',
    lookup_invite_code,
    10,
    interval '10 minutes',
    30,
    interval '1 hour'
  );

  select id
    into target_group_id
  from private.wedding_groups
  where invite_code = lookup_invite_code;

  if target_group_id is null then
    raise exception 'Invitation not found.';
  end if;

  if jsonb_typeof(member_responses) <> 'array' or jsonb_array_length(member_responses) = 0 then
    raise exception 'Add an RSVP response for each invited guest.';
  end if;

  for response in select * from jsonb_array_elements(member_responses)
  loop
    response_member_id := (response ->> 'member_id')::uuid;
    response_status := response ->> 'rsvp_status';

    if response_status not in ('accepted', 'declined') then
      raise exception 'Choose whether each guest will attend.';
    end if;

    if char_length(coalesce(response ->> 'email', '')) > 320 then
      raise exception 'Email must be 320 characters or fewer.';
    end if;

    if char_length(coalesce(response ->> 'phone', '')) > 50 then
      raise exception 'Phone must be 50 characters or fewer.';
    end if;

    if char_length(coalesce(response ->> 'notes', '')) > 2000 then
      raise exception 'Notes must be 2000 characters or fewer.';
    end if;

    update private.wedding_group_members
    set
      rsvp_status = response_status,
      email = nullif(trim(response ->> 'email'), ''),
      phone = nullif(trim(response ->> 'phone'), ''),
      notes = nullif(trim(response ->> 'notes'), ''),
      submitted_at = now(),
      updated_at = now()
    where id = response_member_id
      and group_id = target_group_id;

    if not found then
      raise exception 'A guest in this RSVP was not found for this invitation.';
    end if;
  end loop;

  update private.wedding_groups
  set updated_at = now()
  where id = target_group_id;
end;
$$;

revoke all on function private.get_request_ip() from public, anon, authenticated;
revoke all on function private.check_rsvp_rate_limit(text, uuid, integer, interval, integer, interval) from public, anon, authenticated;
revoke all on function api.get_group_by_invite_code(uuid) from public;
revoke all on function api.submit_group_rsvp(uuid, jsonb) from public;
grant execute on function api.get_group_by_invite_code(uuid) to anon;
grant execute on function api.submit_group_rsvp(uuid, jsonb) to anon;
