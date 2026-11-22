-- One copy of each record per account, including a tombstone for deleted records.
create table public.categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(btrim(id)) > 0),
  value jsonb,
  stamp timestamptz not null,
  operation uuid not null,
  primary key (user_id, id),
  check (value is null or (
    jsonb_typeof(value->'name') = 'string' and length(btrim(value->>'name')) > 0
    and (value->>'color') ~ '^#[0-9a-fA-F]{6}$'
  ) is true)
);

create table public.settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id = 'preferences'),
  value jsonb,
  stamp timestamptz not null,
  operation uuid not null,
  category_id text generated always as (value->>'default_category_id') stored,
  primary key (user_id, id),
  foreign key (user_id, category_id) references public.categories(user_id, id) deferrable initially deferred,
  check (value is null or (
    category_id is not null and (value->>'theme') in ('system', 'light', 'dark')
    and value->'week_start' in ('0'::jsonb, '1'::jsonb)
  ) is true)
);

create table public.items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(btrim(id)) > 0),
  value jsonb,
  stamp timestamptz not null,
  operation uuid not null,
  category_id text generated always as (value->>'category_id') stored,
  primary key (user_id, id),
  foreign key (user_id, category_id) references public.categories(user_id, id) deferrable initially deferred,
  check (value is null or (
    category_id is not null and jsonb_typeof(value->'title') = 'string' and length(btrim(value->>'title')) > 0
    and jsonb_typeof(value->'completed') = 'boolean'
    and (value->>'sort_order') ~ '^-?[0-9]{1,16}$'
    and (value->'date' = 'null'::jsonb or ((value->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and (value->>'date')::date is not null))
    and (value->'start_time' = 'null'::jsonb or (value->>'start_time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$')
    and (value->'end_time' = 'null'::jsonb or (
      (value->>'end_time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      and (value->>'end_time')::time >= (value->>'start_time')::time
    ))
  ) is true)
);

create table public.deadlines (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(btrim(id)) > 0),
  value jsonb,
  stamp timestamptz not null,
  operation uuid not null,
  category_id text generated always as (value->>'category_id') stored,
  primary key (user_id, id),
  foreign key (user_id, category_id) references public.categories(user_id, id) deferrable initially deferred,
  check (value is null or (
    category_id is not null and jsonb_typeof(value->'title') = 'string' and length(btrim(value->>'title')) > 0
    and (value->>'start_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and (value->>'end_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and (value->>'start_date')::date <= (value->>'end_date')::date
  ) is true)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['categories', 'settings', 'items', 'deadlines'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
    execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name);
    execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name);
    execute format('alter publication supabase_realtime add table public.%I', table_name);
  end loop;
end $$;

create function public.calendar_snapshot() returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'collection', data.collection, 'id', data.id, 'value', data.value, 'operation', data.operation,
    'stamp', to_char(data.stamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )), '[]'::jsonb)
  from (
    select 'categories' collection, id, value, stamp, operation from public.categories where user_id = (select auth.uid())
    union all select 'settings', id, value, stamp, operation from public.settings where user_id = (select auth.uid())
    union all select 'items', id, value, stamp, operation from public.items where user_id = (select auth.uid())
    union all select 'deadlines', id, value, stamp, operation from public.deadlines where user_id = (select auth.uid())
  ) data;
$$;

create function public.apply_calendar_changes(changes jsonb) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  change jsonb;
  table_name text;
  requester uuid := auth.uid();
  payload jsonb;
begin
  if requester is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Stable lock order across devices. Each client batch commits as one transaction.
  for change in select value from jsonb_array_elements(changes) order by value->>'collection', value->>'id' loop
    table_name := change->>'collection';
    if table_name is null or table_name not in ('categories', 'settings', 'items', 'deadlines') then
      raise exception 'Unknown calendar collection';
    end if;
    payload := nullif(change->'value', 'null'::jsonb);
    if payload is not null and (
      payload->>'id' is distinct from change->>'id' or payload->>'created_at' is null or payload->>'updated_at' is null
    ) then raise exception 'Invalid calendar record'; end if;
    execute format(
      'insert into public.%I as current_row (user_id, id, value, stamp, operation)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, id) do update
       set value = excluded.value, stamp = excluded.stamp, operation = excluded.operation
       where (current_row.stamp, current_row.operation) < (excluded.stamp, excluded.operation)', table_name)
      using requester, change->>'id', payload, (change->>'stamp')::timestamptz, (change->>'operation')::uuid;
  end loop;
end;
$$;

revoke all on function public.calendar_snapshot() from public, anon;
revoke all on function public.apply_calendar_changes(jsonb) from public, anon;
grant execute on function public.calendar_snapshot() to authenticated;
grant execute on function public.apply_calendar_changes(jsonb) to authenticated;
