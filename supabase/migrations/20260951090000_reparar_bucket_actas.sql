-- ============================================================
-- REPARAR: el bucket "actas" no se había creado
-- ============================================================
-- 20260948090000_actas_pdf.sql sí dejó la tabla actas y las funciones
-- (registrar_acta/listar_actas) creadas, pero el bucket de Storage
-- "actas" no existe en la base real — probablemente por el mismo tipo
-- de aplicación parcial que ya pasó antes con otra migración (ver
-- memoria del deploy: "up to date" pero el SQL real no había corrido
-- completo). Sin el bucket, la subida del PDF falla silenciosamente y
-- Finalizar Turno nunca llega a llamar registrar_acta().
--
-- Todo acá es idempotente (on conflict / drop if exists) para que no
-- rompa nada si alguna parte SÍ se había aplicado.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('actas', 'actas', true)
on conflict (id) do nothing;

drop policy if exists "actas_insert" on storage.objects;
create policy "actas_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'actas');

drop policy if exists "actas_select" on storage.objects;
create policy "actas_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'actas');
