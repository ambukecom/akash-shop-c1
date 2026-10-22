-- =====================================================================
--  AKASH SHOP C1 · Inventory Tracker — Supabase database setup
--  Run this whole file once in Supabase → SQL Editor → New query → Run.
--  It is safe to run again later (it won't delete any data).
-- =====================================================================


-- 1. STAFF ALLOW-LIST -------------------------------------------------
-- Only login accounts listed in this table can see or change anything.
-- Even if someone manages to create an account, they get nothing.
create table if not exists public.staff (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  added_at  timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;


-- 2. BRANDS (one tab per brand) ----------------------------------------
create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  color       text not null default '#0b84d6',
  created_at  timestamptz not null default now()
);


-- 3. ITEMS -------------------------------------------------------------
create table if not exists public.items (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid references public.brands(id) on delete set null,
  name                  text not null check (length(trim(name)) > 0),
  sku                   text unique,
  category              text,
  shop_qty              integer not null default 0 check (shop_qty >= 0),
  warehouse_qty         integer not null default 0 check (warehouse_qty >= 0),
  low_stock_threshold   integer not null default 5 check (low_stock_threshold >= 0),
  unit_price            numeric(12,2) not null default 0 check (unit_price >= 0),
  flagged_out_of_stock  boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists items_brand_idx on public.items (brand_id);


-- 4. STOCK HISTORY (written automatically, cannot be edited) -----------
create table if not exists public.stock_movements (
  id          bigint generated always as identity primary key,
  item_id     uuid references public.items(id) on delete set null,
  item_name   text not null,
  location    text not null check (location in ('shop', 'warehouse')),
  change      integer not null,
  reason      text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists movements_created_idx on public.stock_movements (created_at desc);


-- 5. TRIGGERS ----------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists items_touch on public.items;
create trigger items_touch
  before update on public.items
  for each row execute function public.touch_updated_at();

-- Every change to a quantity is recorded in stock_movements.
create or replace function public.log_stock_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_reason text := coalesce(
    nullif(current_setting('app.stock_reason', true), ''),
    case when tg_op = 'INSERT' then 'Initial stock' else 'Manual edit' end
  );
begin
  if tg_op = 'INSERT' then
    if new.shop_qty <> 0 then
      insert into stock_movements (item_id, item_name, location, change, reason)
      values (new.id, new.name, 'shop', new.shop_qty, v_reason);
    end if;
    if new.warehouse_qty <> 0 then
      insert into stock_movements (item_id, item_name, location, change, reason)
      values (new.id, new.name, 'warehouse', new.warehouse_qty, v_reason);
    end if;
  else
    if new.shop_qty <> old.shop_qty then
      insert into stock_movements (item_id, item_name, location, change, reason)
      values (new.id, new.name, 'shop', new.shop_qty - old.shop_qty, v_reason);
    end if;
    if new.warehouse_qty <> old.warehouse_qty then
      insert into stock_movements (item_id, item_name, location, change, reason)
      values (new.id, new.name, 'warehouse', new.warehouse_qty - old.warehouse_qty, v_reason);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists items_log_stock on public.items;
create trigger items_log_stock
  after insert or update of shop_qty, warehouse_qty on public.items
  for each row execute function public.log_stock_change();


-- 6. STOCK FUNCTIONS (used by the app's "Adjust stock" window) ---------

-- Stock in (+) or stock out (-) at one location.
-- Adding stock automatically clears an "out of stock" flag.
create or replace function public.adjust_stock(
  p_item uuid, p_location text, p_change integer, p_reason text default null
)
returns public.items
language plpgsql security invoker
set search_path = public
as $$
declare
  r public.items;
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  if p_change is null or p_change = 0 then raise exception 'Quantity must not be zero'; end if;
  if p_location not in ('shop', 'warehouse') then raise exception 'Location must be shop or warehouse'; end if;

  select * into r from public.items where id = p_item for update;
  if not found then raise exception 'Item not found'; end if;

  if p_location = 'shop' and r.shop_qty + p_change < 0 then
    raise exception 'Only % in the shop', r.shop_qty;
  elsif p_location = 'warehouse' and r.warehouse_qty + p_change < 0 then
    raise exception 'Only % in the warehouse', r.warehouse_qty;
  end if;

  perform set_config('app.stock_reason',
    coalesce(nullif(trim(p_reason), ''), case when p_change > 0 then 'Stock in' else 'Stock out' end), true);

  update public.items set
    shop_qty      = shop_qty      + case when p_location = 'shop'      then p_change else 0 end,
    warehouse_qty = warehouse_qty + case when p_location = 'warehouse' then p_change else 0 end,
    flagged_out_of_stock = case when p_change > 0 then false else flagged_out_of_stock end
  where id = p_item
  returning * into r;

  perform set_config('app.stock_reason', '', true);
  return r;
end $$;

-- Move units between warehouse and shop in one safe step.
create or replace function public.transfer_stock(
  p_item uuid, p_qty integer, p_direction text default 'to_shop'
)
returns public.items
language plpgsql security invoker
set search_path = public
as $$
declare
  r public.items;
  to_shop boolean := (p_direction = 'to_shop');
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be at least 1'; end if;
  if p_direction not in ('to_shop', 'to_warehouse') then raise exception 'Invalid direction'; end if;

  select * into r from public.items where id = p_item for update;
  if not found then raise exception 'Item not found'; end if;

  if to_shop and r.warehouse_qty < p_qty then
    raise exception 'Only % in the warehouse', r.warehouse_qty;
  elsif not to_shop and r.shop_qty < p_qty then
    raise exception 'Only % in the shop', r.shop_qty;
  end if;

  perform set_config('app.stock_reason',
    case when to_shop then 'Transfer to shop' else 'Transfer to warehouse' end, true);

  update public.items set
    shop_qty      = shop_qty      + case when to_shop then p_qty else -p_qty end,
    warehouse_qty = warehouse_qty + case when to_shop then -p_qty else p_qty end
  where id = p_item
  returning * into r;

  perform set_config('app.stock_reason', '', true);
  return r;
end $$;


-- 7. SECURITY: ROW-LEVEL SECURITY ---------------------------------------
alter table public.staff           enable row level security;
alter table public.brands          enable row level security;
alter table public.items           enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "staff can read own row" on public.staff;
create policy "staff can read own row" on public.staff
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "staff manage brands" on public.brands;
create policy "staff manage brands" on public.brands
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff manage items" on public.items;
create policy "staff manage items" on public.items
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff read movements" on public.stock_movements;
create policy "staff read movements" on public.stock_movements
  for select to authenticated using (public.is_staff());

-- Visitors who are not signed in get no access at all.
revoke all on public.staff, public.brands, public.items, public.stock_movements from anon;

-- Stock history can only be written by the database itself.
revoke insert, update, delete on public.stock_movements from authenticated;

revoke execute on function public.is_staff()                                  from public, anon;
revoke execute on function public.adjust_stock(uuid, text, integer, text)     from public, anon;
revoke execute on function public.transfer_stock(uuid, integer, text)         from public, anon;
grant  execute on function public.is_staff()                                  to authenticated;
grant  execute on function public.adjust_stock(uuid, text, integer, text)     to authenticated;
grant  execute on function public.transfer_stock(uuid, integer, text)         to authenticated;


-- 8. ADD THE SHOPKEEPER ------------------------------------------------
-- First create his login in Authentication → Users → Add user.
-- Then replace the email below, remove the two dashes at the start of
-- each line, and run just these three lines:
--
-- insert into public.staff (user_id)
-- select id from auth.users where email = 'shopkeeper@example.com'
-- on conflict do nothing;
