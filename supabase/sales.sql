-- =====================================================================
--  AKASH SHOP C1 · Live Sales Counter, Invoices and Not Fully Paid
--  Run this whole file once in Supabase → SQL Editor → New query → Run.
--  It only ADDS new tables and functions. Your items, brands and stock
--  history are not changed. Safe to run again.
-- =====================================================================


-- 1. SHOP DETAILS (printed on every invoice) ----------------------------
create table if not exists public.shop_settings (
  id           integer primary key default 1 check (id = 1),
  shop_name    text not null default 'AKASH SHOP C1',
  address      text,
  phone        text,
  email        text,
  footer_note  text not null default 'Thanks For Shopping With Us',
  updated_at   timestamptz not null default now()
);
insert into public.shop_settings (id) values (1) on conflict do nothing;


-- 2. FREQUENT CUSTOMERS -------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  address     text,
  phone       text,
  created_at  timestamptz not null default now()
);


-- 3. SALES / INVOICES ---------------------------------------------------
create sequence if not exists public.invoice_seq start 1001;

create table if not exists public.sales (
  id                uuid primary key default gen_random_uuid(),
  invoice_no        text not null unique,
  customer_id       uuid references public.customers(id) on delete set null,
  customer_name     text not null,
  customer_address  text,
  customer_phone    text,
  is_private        boolean not null default false,
  total             numeric(12,2) not null check (total >= 0),
  amount_paid       numeric(12,2) not null default 0 check (amount_paid >= 0),
  payment_method    text not null,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  check (amount_paid <= total)
);
create index if not exists sales_created_idx on public.sales (created_at desc);

create table if not exists public.sale_items (
  id          bigint generated always as identity primary key,
  sale_id     uuid not null references public.sales(id) on delete cascade,
  item_id     uuid references public.items(id) on delete set null,
  item_name   text not null,
  sku         text,
  qty         integer not null check (qty > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  line_total  numeric(12,2) not null
);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

create table if not exists public.sale_payments (
  id          bigint generated always as identity primary key,
  sale_id     uuid not null references public.sales(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  method      text not null,
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists sale_payments_sale_idx on public.sale_payments (sale_id);


-- 4. RECORD A SALE ------------------------------------------------------
-- Does everything in one safe step: checks shop stock, creates the
-- invoice, deducts the items from SHOP stock (logged in stock history as
-- "Sale C1-01001"), saves the customer and the first payment.
create or replace function public.record_sale(
  p_lines jsonb, p_customer jsonb, p_paid numeric, p_method text
)
returns public.sales
language plpgsql security definer
set search_path = public
as $$
declare
  r            record;
  v_item       public.items;
  v_sale       public.sales;
  v_total      numeric(12,2) := 0;
  v_mode       text := coalesce(p_customer->>'mode', 'private');
  v_cust_id    uuid;
  v_name       text := nullif(trim(p_customer->>'name'), '');
  v_address    text := nullif(trim(p_customer->>'address'), '');
  v_phone      text := nullif(trim(p_customer->>'phone'), '');
  v_invoice    text;
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'The sale has no items';
  end if;
  if p_method is null or p_method not in ('Cash', 'Card', 'Bank transfer') then
    raise exception 'Choose a payment method';
  end if;

  -- validate lines and work out the total
  for r in
    select (l->>'item_id')::uuid as item_id, (l->>'qty')::int as qty, (l->>'unit_price')::numeric as price
    from jsonb_array_elements(p_lines) l
  loop
    if r.item_id is null then raise exception 'An item is missing'; end if;
    if r.qty is null or r.qty <= 0 then raise exception 'Quantities must be at least 1'; end if;
    if r.price is null or r.price < 0 then raise exception 'Prices cannot be negative'; end if;
    v_total := v_total + round(r.qty * r.price, 2);
  end loop;

  if p_paid is null or p_paid < 0 then raise exception 'Payment cannot be negative'; end if;
  if round(p_paid, 2) > v_total then raise exception 'Payment is more than the amount due'; end if;

  -- lock the items and check there is enough in the SHOP
  for r in
    select (l->>'item_id')::uuid as item_id, sum((l->>'qty')::int) as qty
    from jsonb_array_elements(p_lines) l group by 1 order by 1
  loop
    select * into v_item from public.items where id = r.item_id for update;
    if not found then raise exception 'An item in this sale no longer exists'; end if;
    if v_item.flagged_out_of_stock then raise exception '"%" is flagged as out of stock', v_item.name; end if;
    if v_item.shop_qty < r.qty then
      raise exception 'Only % of "%" left in the shop', v_item.shop_qty, v_item.name;
    end if;
  end loop;

  -- customer
  if v_mode = 'private' then
    v_name := coalesce(v_name, 'Private customer');
  elsif v_mode = 'frequent' then
    select id, name into v_cust_id, v_name from public.customers where id = (p_customer->>'id')::uuid;
    if v_cust_id is null then raise exception 'That frequent customer no longer exists'; end if;
    update public.customers set
      address = coalesce(v_address, address),
      phone   = coalesce(v_phone, phone)
    where id = v_cust_id;
  else
    if v_name is null then raise exception 'Enter the customer name'; end if;
    if coalesce((p_customer->>'save')::boolean, false) then
      insert into public.customers (name, address, phone) values (v_name, v_address, v_phone)
      on conflict (name) do update set
        address = coalesce(excluded.address, customers.address),
        phone   = coalesce(excluded.phone, customers.phone)
      returning id into v_cust_id;
    end if;
  end if;

  v_invoice := 'C1-' || lpad(nextval('public.invoice_seq')::text, 5, '0');

  insert into public.sales (invoice_no, customer_id, customer_name, customer_address, customer_phone,
                            is_private, total, amount_paid, payment_method)
  values (v_invoice, v_cust_id, v_name, v_address, v_phone,
          v_mode = 'private', v_total, round(p_paid, 2), p_method)
  returning * into v_sale;

  insert into public.sale_items (sale_id, item_id, item_name, sku, qty, unit_price, line_total)
  select v_sale.id, i.id, i.name, i.sku, (l->>'qty')::int, (l->>'unit_price')::numeric,
         round((l->>'qty')::int * (l->>'unit_price')::numeric, 2)
  from jsonb_array_elements(p_lines) with ordinality as x(l, n)
  join public.items i on i.id = (l->>'item_id')::uuid
  order by n;

  -- deduct from shop stock (the stock-history trigger records each line)
  perform set_config('app.stock_reason', 'Sale ' || v_invoice, true);
  update public.items i set shop_qty = i.shop_qty - s.qty
  from (select (l->>'item_id')::uuid as item_id, sum((l->>'qty')::int) as qty
        from jsonb_array_elements(p_lines) l group by 1) s
  where i.id = s.item_id;
  perform set_config('app.stock_reason', '', true);

  if p_paid > 0 then
    insert into public.sale_payments (sale_id, amount, method, note)
    values (v_sale.id, round(p_paid, 2), p_method, 'At time of sale');
  end if;

  return v_sale;
end $$;


-- 5. RECORD A LATER PAYMENT (from the Not Fully Paid tab) ----------------
create or replace function public.add_payment(
  p_sale uuid, p_amount numeric, p_method text, p_note text default null
)
returns public.sales
language plpgsql security definer
set search_path = public
as $$
declare
  v_sale public.sales;
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  if p_method is null or p_method not in ('Cash', 'Card', 'Bank transfer') then
    raise exception 'Choose a payment method';
  end if;
  select * into v_sale from public.sales where id = p_sale for update;
  if not found then raise exception 'Invoice not found'; end if;
  if p_amount is null or round(p_amount, 2) <= 0 then raise exception 'Enter an amount above zero'; end if;
  if round(p_amount, 2) > v_sale.total - v_sale.amount_paid then
    raise exception 'That is more than the % still owed', v_sale.total - v_sale.amount_paid;
  end if;

  insert into public.sale_payments (sale_id, amount, method, note)
  values (p_sale, round(p_amount, 2), p_method, nullif(trim(p_note), ''));

  update public.sales set amount_paid = amount_paid + round(p_amount, 2)
  where id = p_sale returning * into v_sale;
  return v_sale;
end $$;


-- 6. SECURITY ------------------------------------------------------------
alter table public.shop_settings enable row level security;
alter table public.customers     enable row level security;
alter table public.sales         enable row level security;
alter table public.sale_items    enable row level security;
alter table public.sale_payments enable row level security;

drop policy if exists "staff read settings" on public.shop_settings;
create policy "staff read settings" on public.shop_settings
  for select to authenticated using (public.is_staff());
drop policy if exists "staff update settings" on public.shop_settings;
create policy "staff update settings" on public.shop_settings
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff manage customers" on public.customers;
create policy "staff manage customers" on public.customers
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff read sales" on public.sales;
create policy "staff read sales" on public.sales
  for select to authenticated using (public.is_staff());
drop policy if exists "staff read sale items" on public.sale_items;
create policy "staff read sale items" on public.sale_items
  for select to authenticated using (public.is_staff());
drop policy if exists "staff read payments" on public.sale_payments;
create policy "staff read payments" on public.sale_payments
  for select to authenticated using (public.is_staff());

-- Signed-in staff can read everything; sales and payments can only be
-- written through record_sale / add_payment, so stock always matches.
grant usage on schema public to authenticated;
grant select, update                 on public.shop_settings to authenticated;
grant select, insert, update, delete on public.customers     to authenticated;
grant select on public.sales, public.sale_items, public.sale_payments to authenticated;
revoke insert, update, delete on public.sales, public.sale_items, public.sale_payments from authenticated;
revoke all on public.shop_settings, public.customers, public.sales, public.sale_items, public.sale_payments from anon;

revoke execute on function public.record_sale(jsonb, jsonb, numeric, text)  from public, anon;
revoke execute on function public.add_payment(uuid, numeric, text, text)    from public, anon;
grant  execute on function public.record_sale(jsonb, jsonb, numeric, text)  to authenticated;
grant  execute on function public.add_payment(uuid, numeric, text, text)    to authenticated;
