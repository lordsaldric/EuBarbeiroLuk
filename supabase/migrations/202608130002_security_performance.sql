create schema if not exists extensions;
alter extension btree_gist set schema extensions;

create index appointments_service_id_idx on public.appointments (service_id);

alter policy services_public_read on public.services to anon;
alter policy barbers_public_read on public.barbers to anon;
alter policy schedules_public_read on public.work_schedules to anon;
alter policy blocked_slots_public_read on public.blocked_slots to anon;
alter policy appointment_slots_public_read on public.appointment_slots to anon;
alter policy appointments_public_insert on public.appointments to anon;

notify pgrst, 'reload schema';
