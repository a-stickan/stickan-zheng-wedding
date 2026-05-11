drop function if exists api.get_group_by_invite_code(uuid);
drop function if exists api.submit_group_rsvp(uuid, jsonb);
drop function if exists private.check_rsvp_rate_limit(text, uuid, integer, interval, integer, interval);

alter table private.wedding_groups
  alter column invite_code drop default,
  alter column invite_code type text using lower(invite_code::text);

alter table private.wedding_groups
  add constraint wedding_groups_invite_code_format_check
  check (invite_code ~ '^[a-z0-9]{8}$');

alter table private.rsvp_rate_limits
  alter column invite_code type text using lower(invite_code::text);

create or replace function private.check_rsvp_rate_limit(
  rate_action text,
  lookup_invite_code text,
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

create or replace function api.get_group_by_invite_code(lookup_invite_code text)
returns table (
  group_name text,
  members jsonb
)
language plpgsql
security definer
set search_path = api, private
as $$
begin
  lookup_invite_code := lower(trim(lookup_invite_code));

  if lookup_invite_code is null or lookup_invite_code !~ '^[a-z0-9]{8}$' then
    raise exception 'A valid RSVP code is required.';
  end if;

  perform private.check_rsvp_rate_limit(
    'lookup',
    lookup_invite_code,
    30,
    interval '10 minutes',
    100,
    interval '1 hour'
  );

  return query
  select
    wedding_groups.group_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'member_id', wedding_group_members.id,
          'full_name', wedding_group_members.full_name,
          'rsvp_status', wedding_group_members.rsvp_status,
          'email', wedding_group_members.email,
          'phone', wedding_group_members.phone,
          'notes', wedding_group_members.notes
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
end;
$$;

create or replace function api.submit_group_rsvp(
  lookup_invite_code text,
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
  expected_member_count integer;
  submitted_member_count integer;
  distinct_member_count integer;
begin
  lookup_invite_code := lower(trim(lookup_invite_code));

  if lookup_invite_code is null or lookup_invite_code !~ '^[a-z0-9]{8}$' then
    raise exception 'A valid RSVP code is required.';
  end if;

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

  if member_responses is null or jsonb_typeof(member_responses) <> 'array' or jsonb_array_length(member_responses) = 0 then
    raise exception 'Add an RSVP response for each invited guest.';
  end if;

  select count(*)
    into expected_member_count
  from private.wedding_group_members
  where group_id = target_group_id;

  select count(*), count(distinct response_item ->> 'member_id')
    into submitted_member_count, distinct_member_count
  from jsonb_array_elements(member_responses) as response_item;

  if submitted_member_count <> expected_member_count or distinct_member_count <> expected_member_count then
    raise exception 'Submit one RSVP response for each invited guest.';
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

revoke all on function private.check_rsvp_rate_limit(text, text, integer, interval, integer, interval) from public, anon, authenticated;
revoke all on function api.get_group_by_invite_code(text) from public, anon, authenticated;
revoke all on function api.submit_group_rsvp(text, jsonb) from public, anon, authenticated;
grant usage on schema api to service_role;
grant execute on function api.get_group_by_invite_code(text) to service_role;
grant execute on function api.submit_group_rsvp(text, jsonb) to service_role;
