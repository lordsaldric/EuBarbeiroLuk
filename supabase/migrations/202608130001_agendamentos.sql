create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.appointment_status as enum ('pending', 'accepted', 'denied', 'completed');

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category text not null check (char_length(category) between 2 and 80),
  title text not null unique check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  duration_minutes integer not null default 30 check (duration_minutes between 10 and 480),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.barbers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  initials text not null check (char_length(initials) between 1 and 3),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  shift_start time not null,
  shift_end time not null,
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes in (10, 15, 20, 30, 45, 60)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_schedules_valid_shift check (shift_start < shift_end),
  constraint work_schedules_unique_shift unique (barber_id, weekday, shift_start, shift_end)
);

create table public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text not null default '' check (char_length(reason) <= 180),
  created_at timestamptz not null default now(),
  constraint blocked_slots_valid_range check (start_time < end_time),
  constraint blocked_slots_unique_range unique (barber_id, block_date, start_time, end_time)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 100),
  customer_phone text check (customer_phone is null or char_length(customer_phone) between 8 and 24),
  service_id uuid not null references public.services(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  appointment_date date not null,
  appointment_time time not null,
  duration_minutes integer not null check (duration_minutes between 10 and 480),
  starts_at timestamp not null,
  ends_at timestamp not null,
  status public.appointment_status not null default 'pending',
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now(),
  constraint appointments_valid_range check (starts_at < ends_at),
  constraint appointments_no_overlap exclude using gist (
    barber_id with =,
    tsrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'accepted', 'completed'))
);

create table public.appointment_slots (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status public.appointment_status not null,
  constraint appointment_slots_valid_range check (start_time < end_time)
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Administrador' check (char_length(display_name) between 2 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table private.admin_invites (
  email text primary key check (email = lower(email)),
  display_name text not null default 'Administrador',
  active boolean not null default true,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index appointments_status_date_idx on public.appointments (status, appointment_date, appointment_time);
create index appointments_barber_date_idx on public.appointments (barber_id, appointment_date, appointment_time);
create index work_schedules_barber_weekday_idx on public.work_schedules (barber_id, weekday) where active;
create index blocked_slots_barber_date_idx on public.blocked_slots (barber_id, block_date, start_time);
create index appointment_slots_barber_date_idx on public.appointment_slots (barber_id, appointment_date, start_time);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
      and active
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create or replace function private.set_appointment_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.status is distinct from old.status then
    new.status_updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function private.set_appointment_updated_at() from public, anon, authenticated;

create or replace function private.validate_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_duration integer;
  local_now timestamp := timezone('America/Bahia', now());
begin
  if tg_op = 'UPDATE'
    and new.service_id is not distinct from old.service_id
    and new.barber_id is not distinct from old.barber_id
    and new.appointment_date is not distinct from old.appointment_date
    and new.appointment_time is not distinct from old.appointment_time then
    return new;
  end if;

  select duration_minutes
    into service_duration
  from public.services
  where id = new.service_id
    and active;

  if not found then
    raise exception 'SERVICE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.barbers where id = new.barber_id and active
  ) then
    raise exception 'BARBER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  new.duration_minutes = service_duration;
  new.starts_at = new.appointment_date + new.appointment_time;
  new.ends_at = new.starts_at + make_interval(mins => service_duration);

  if new.appointment_date < local_now::date
    or (new.appointment_date = local_now::date and new.appointment_time <= local_now::time) then
    raise exception 'PAST_APPOINTMENT' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.work_schedules ws
    where ws.barber_id = new.barber_id
      and ws.active
      and ws.weekday = extract(dow from new.appointment_date)::smallint
      and new.appointment_time >= ws.shift_start
      and new.appointment_time + make_interval(mins => service_duration) <= ws.shift_end
      and mod(
        (extract(epoch from (new.appointment_time - ws.shift_start)) / 60)::integer,
        ws.slot_interval_minutes
      ) = 0
  ) then
    raise exception 'OUTSIDE_WORK_SCHEDULE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.blocked_slots bs
    where bs.barber_id = new.barber_id
      and bs.block_date = new.appointment_date
      and new.appointment_time < bs.end_time
      and new.appointment_time + make_interval(mins => service_duration) > bs.start_time
  ) then
    raise exception 'BLOCKED_APPOINTMENT' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_appointment() from public, anon, authenticated;

create or replace function private.sync_appointment_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.appointment_slots where appointment_id = old.id;
    return old;
  end if;

  if new.status = 'denied' then
    delete from public.appointment_slots where appointment_id = new.id;
  else
    insert into public.appointment_slots (
      appointment_id,
      barber_id,
      appointment_date,
      start_time,
      end_time,
      status
    ) values (
      new.id,
      new.barber_id,
      new.appointment_date,
      new.appointment_time,
      new.appointment_time + make_interval(mins => new.duration_minutes),
      new.status
    )
    on conflict (appointment_id) do update set
      barber_id = excluded.barber_id,
      appointment_date = excluded.appointment_date,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      status = excluded.status;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_appointment_slot() from public, anon, authenticated;

create or replace function private.handle_new_admin_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invited_name text;
begin
  select display_name
    into invited_name
  from private.admin_invites
  where email = lower(new.email)
    and active
    and used_at is null;

  if found then
    insert into public.admin_users (user_id, display_name)
    values (new.id, invited_name)
    on conflict (user_id) do nothing;

    update private.admin_invites
    set used_at = now()
    where email = lower(new.email);
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_admin_user() from public, anon, authenticated;

create trigger services_set_updated_at
before update on public.services
for each row execute function private.set_updated_at();

create trigger barbers_set_updated_at
before update on public.barbers
for each row execute function private.set_updated_at();

create trigger work_schedules_set_updated_at
before update on public.work_schedules
for each row execute function private.set_updated_at();

create trigger appointments_validate
before insert or update of service_id, barber_id, appointment_date, appointment_time
on public.appointments
for each row execute function private.validate_appointment();

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function private.set_appointment_updated_at();

create trigger appointments_sync_slot
after insert or update or delete on public.appointments
for each row execute function private.sync_appointment_slot();

create trigger auth_users_create_admin
after insert on auth.users
for each row execute function private.handle_new_admin_user();

alter table public.services enable row level security;
alter table public.barbers enable row level security;
alter table public.work_schedules enable row level security;
alter table public.blocked_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.admin_users enable row level security;

create policy services_public_read
on public.services for select to anon, authenticated
using (active);

create policy services_admin_all
on public.services for all to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy barbers_public_read
on public.barbers for select to anon, authenticated
using (active);

create policy barbers_admin_all
on public.barbers for all to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy schedules_public_read
on public.work_schedules for select to anon, authenticated
using (active);

create policy schedules_admin_all
on public.work_schedules for all to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy blocked_slots_public_read
on public.blocked_slots for select to anon, authenticated
using (block_date >= timezone('America/Bahia', now())::date);

create policy blocked_slots_admin_all
on public.blocked_slots for all to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy appointment_slots_public_read
on public.appointment_slots for select to anon, authenticated
using (appointment_date >= timezone('America/Bahia', now())::date);

create policy appointment_slots_admin_read
on public.appointment_slots for select to authenticated
using (private.is_admin());

create policy appointments_public_insert
on public.appointments for insert to anon, authenticated
with check (
  status = 'pending'
  and char_length(btrim(customer_name)) between 2 and 100
);

create policy appointments_admin_all
on public.appointments for all to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy admin_users_read_self
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()) and active);

revoke all on public.services from anon, authenticated;
revoke all on public.barbers from anon, authenticated;
revoke all on public.work_schedules from anon, authenticated;
revoke all on public.blocked_slots from anon, authenticated;
revoke all on public.appointments from anon, authenticated;
revoke all on public.appointment_slots from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;

grant select on public.services, public.barbers, public.work_schedules, public.blocked_slots, public.appointment_slots to anon, authenticated;
grant insert (customer_name, customer_phone, service_id, barber_id, appointment_date, appointment_time, status)
  on public.appointments to anon, authenticated;
grant select, insert, update, delete on public.services, public.barbers, public.work_schedules, public.blocked_slots, public.appointments
  to authenticated;
grant select on public.admin_users to authenticated;

insert into public.services (category, title, description, duration_minutes, sort_order) values
  ('Cortes', 'Corte masculino', 'Corte pensado para o formato do rosto, estilo e preferência de acabamento.', 40, 10),
  ('Cortes', 'Corte infantil masculino', 'Atendimento cuidadoso e corte adequado para o público infantil.', 40, 20),
  ('Cortes', 'Corte na máquina', 'Visual uniforme ou graduado com acabamento preciso na máquina.', 30, 30),
  ('Cortes', 'Pezinho masculino', 'Contornos e acabamento para manter o corte sempre alinhado.', 20, 40),
  ('Cortes', 'Corte feminino', 'Corte personalizado de acordo com o estilo e o movimento dos fios.', 60, 50),
  ('Cortes', 'Corte de franja feminino', 'Ajuste e desenho da franja com atenção ao formato do rosto.', 30, 60),
  ('Barba', 'Barba e acabamento', 'Desenho, alinhamento e contornos definidos para valorizar o rosto.', 30, 70),
  ('Barba', 'Bigode', 'Aparo e acabamento do bigode para um visual limpo e equilibrado.', 20, 80),
  ('Barba', 'Corte + barba', 'Experiência completa para harmonizar cabelo, barba e acabamento.', 60, 90),
  ('Cor e transformação', 'Luzes masculinas', 'Iluminação dos fios com resultado adaptado ao estilo desejado.', 120, 100),
  ('Cor e transformação', 'Platinado masculino', 'Transformação completa para um visual marcante e moderno.', 180, 110),
  ('Cor e transformação', 'Coloração', 'Mudança ou renovação da cor com avaliação prévia dos fios.', 90, 120),
  ('Cor e transformação', 'Progressiva masculina', 'Redução de volume e alinhamento dos fios masculinos.', 120, 130),
  ('Cor e transformação', 'Luzes femininas', 'Iluminação personalizada para criar contraste e movimento.', 180, 140),
  ('Cor e transformação', 'Morena iluminada', 'Pontos de luz para valorizar a cor natural com suavidade.', 180, 150),
  ('Cor e transformação', 'Mechas coloridas', 'Cores criativas aplicadas em mechas selecionadas do cabelo.', 150, 160),
  ('Tratamentos', 'Hidratação', 'Reposição de água para devolver maciez e brilho aos fios.', 40, 170),
  ('Tratamentos', 'Matização', 'Correção e manutenção do tom de cabelos claros ou descoloridos.', 50, 180),
  ('Tratamentos', 'Nutrição profunda', 'Reposição de nutrientes para fios mais alinhados e protegidos.', 50, 190),
  ('Tratamentos', 'Reconstrução', 'Cuidado intensivo para fortalecer cabelos fragilizados.', 60, 200),
  ('Tratamentos', 'Selagem dos fios', 'Tratamento para alinhamento, brilho e controle do frizz.', 90, 210),
  ('Tratamentos', 'Relaxamento', 'Redução de volume com avaliação das condições do cabelo.', 120, 220);

insert into public.barbers (name, initials, sort_order) values
  ('Lucas', 'L', 10),
  ('Willian', 'W', 20);

insert into public.work_schedules (barber_id, weekday, shift_start, shift_end, slot_interval_minutes)
select b.id, d.weekday, d.shift_start, d.shift_end, 10
from public.barbers b
cross join (
  values
    (1::smallint, '09:00'::time, '12:00'::time),
    (1::smallint, '14:00'::time, '19:00'::time),
    (2::smallint, '09:00'::time, '12:00'::time),
    (2::smallint, '14:00'::time, '19:00'::time),
    (3::smallint, '09:00'::time, '12:00'::time),
    (3::smallint, '14:00'::time, '19:00'::time),
    (4::smallint, '09:00'::time, '12:00'::time),
    (4::smallint, '14:00'::time, '19:00'::time),
    (5::smallint, '09:00'::time, '12:00'::time),
    (5::smallint, '14:00'::time, '19:00'::time),
    (6::smallint, '09:00'::time, '13:00'::time)
) as d(weekday, shift_start, shift_end)
where b.name in ('Lucas', 'Willian');

notify pgrst, 'reload schema';
