-- Capybara Control · tabla de datos en Supabase
-- Pégalo en Supabase › SQL Editor › New query y pulsa Run. Se puede ejecutar más de una vez.

create table if not exists public.cc_records (
  collection  text        not null,               -- products, movements, purchases, expenses, suppliers, counts, audit, inbox… o _state/_shape
  id          text        not null,               -- id del registro dentro de la colección
  pos         integer     not null default 0,     -- orden dentro de la colección
  data        jsonb       not null,               -- el registro completo
  updated_at  timestamptz not null default now(),
  updated_by  uuid        default auth.uid(),
  primary key (collection, id)
);

create index if not exists cc_records_collection_pos on public.cc_records (collection, pos);

-- Quién y cuándo cambió cada fila
create or replace function public.cc_records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists cc_records_touch on public.cc_records;
create trigger cc_records_touch before insert or update on public.cc_records
  for each row execute function public.cc_records_touch();

-- Seguridad: solo usuarios con sesión iniciada leen y escriben. Nadie anónimo.
alter table public.cc_records enable row level security;

drop policy if exists "cc lee equipo"      on public.cc_records;
drop policy if exists "cc inserta equipo"  on public.cc_records;
drop policy if exists "cc edita equipo"    on public.cc_records;
drop policy if exists "cc borra equipo"    on public.cc_records;

create policy "cc lee equipo"     on public.cc_records for select to authenticated using (true);
create policy "cc inserta equipo" on public.cc_records for insert to authenticated with check (true);
create policy "cc edita equipo"   on public.cc_records for update to authenticated using (true) with check (true);
create policy "cc borra equipo"   on public.cc_records for delete to authenticated using (true);

-- Cambios en vivo entre usuarios (Realtime)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cc_records') then
    alter publication supabase_realtime add table public.cc_records;
  end if;
end $$;
