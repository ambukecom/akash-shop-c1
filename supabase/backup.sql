-- =====================================================================
--  AKASH SHOP C1 · Backup & Restore
--  Run this whole file once in Supabase → SQL Editor → New query → Run.
--  It adds the "restore" function used by the Backup / Restore button.
--  It does not change or delete any data by itself. Safe to run again.
-- =====================================================================


-- 1. Stock history trigger: stay quiet while a backup is being restored,
--    so restored items don't create fake "Initial stock" history lines.
create or replace function public.log_stock_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if current_setting('app.restoring', true) = 'on' then
    return new;
  end if;

  v_reason := coalesce(
    nullif(current_setting('app.stock_reason', true), ''),
    case when tg_op = 'INSERT' then 'Initial stock' else 'Manual edit' end
  );

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


-- 2. RESTORE A BACKUP FILE ------------------------------------------------
-- Replaces ALL brands, items, stock history, customers, invoices and
-- payments with the contents of the backup, keeping every original ID,
-- date and invoice number. It runs as one step: if anything in the file is
-- wrong, nothing is changed. Logins and staff access are never touched.
create or replace function public.restore_backup(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  d      jsonb := p->'data';
  n_inv  integer;
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  if p->>'format' is distinct from 'akash-shop-c1-backup' then
    raise exception 'This file is not an AKASH SHOP C1 backup';
  end if;
  if coalesce((p->>'version')::int, 0) > 1 then
    raise exception 'This backup was made by a newer version of the app';
  end if;
  if d is null or jsonb_typeof(d) <> 'object' then
    raise exception 'The backup file is empty or damaged';
  end if;

  perform set_config('app.restoring', 'on', true);

  truncate table public.sale_payments, public.sale_items, public.sales, public.customers,
                 public.stock_movements, public.items, public.brands
    restart identity;

  insert into public.brands
    select * from jsonb_populate_recordset(null::public.brands, coalesce(d->'brands', '[]'));
  insert into public.items
    select * from jsonb_populate_recordset(null::public.items, coalesce(d->'items', '[]'));
  insert into public.customers
    select * from jsonb_populate_recordset(null::public.customers, coalesce(d->'customers', '[]'));
  insert into public.sales
    select * from jsonb_populate_recordset(null::public.sales, coalesce(d->'sales', '[]'));
  insert into public.sale_items overriding system value
    select * from jsonb_populate_recordset(null::public.sale_items, coalesce(d->'sale_items', '[]'));
  insert into public.sale_payments overriding system value
    select * from jsonb_populate_recordset(null::public.sale_payments, coalesce(d->'sale_payments', '[]'));
  insert into public.stock_movements overriding system value
    select * from jsonb_populate_recordset(null::public.stock_movements, coalesce(d->'stock_movements', '[]'));

  if jsonb_typeof(d->'shop_settings') = 'array' and jsonb_array_length(d->'shop_settings') > 0 then
    update public.shop_settings s set
      shop_name   = coalesce(x.shop_name, s.shop_name),
      address     = x.address,
      phone       = x.phone,
      email       = x.email,
      footer_note = coalesce(x.footer_note, s.footer_note),
      updated_at  = now()
    from jsonb_populate_record(null::public.shop_settings, d->'shop_settings'->0) x
    where s.id = 1;
  end if;

  -- carry on numbering after the restored data
  perform setval(pg_get_serial_sequence('public.sale_items', 'id'),      coalesce((select max(id) from public.sale_items), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.sale_payments', 'id'),   coalesce((select max(id) from public.sale_payments), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.stock_movements', 'id'), coalesce((select max(id) from public.stock_movements), 0) + 1, false);
  select coalesce(max(nullif(substring(invoice_no from '(\d+)$'), '')::int), 1000) into n_inv from public.sales;
  perform setval('public.invoice_seq', greatest(n_inv + 1, 1001), false);

  perform set_config('app.restoring', '', true);

  return jsonb_build_object(
    'brands',    (select count(*) from public.brands),
    'items',     (select count(*) from public.items),
    'customers', (select count(*) from public.customers),
    'invoices',  (select count(*) from public.sales),
    'payments',  (select count(*) from public.sale_payments),
    'history',   (select count(*) from public.stock_movements)
  );
end $$;

revoke execute on function public.restore_backup(jsonb) from public, anon;
grant  execute on function public.restore_backup(jsonb) to authenticated;
