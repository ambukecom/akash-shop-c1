-- =====================================================================
-- AKASH SHOP C1 · AI Shop Assistant memory (optional)
-- Run once in Supabase → SQL Editor. Lets the assistant remember the
-- names and phrases you teach it on every phone and computer.
-- Without this, the assistant still works and remembers on each device.
-- =====================================================================

create table if not exists public.assistant_memory (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.assistant_memory enable row level security;

drop policy if exists "staff manage assistant memory" on public.assistant_memory;
create policy "staff manage assistant memory" on public.assistant_memory
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, insert, update on public.assistant_memory to authenticated;
