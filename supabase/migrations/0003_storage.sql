-- Fase 5 — Storage: bucket público "avatares" para la foto de perfil.
-- Cada usuario escribe solo en su carpeta {user_id}/...; la lectura es pública
-- (el avatar se sirve por URL pública).

insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

-- Lectura pública del bucket (además del endpoint /object/public).
create policy "avatares lectura publica" on storage.objects
  for select
  using (bucket_id = 'avatares');

-- Escritura solo del dueño, dentro de su carpeta {user_id}/...
create policy "avatares insert propio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatares update propio" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatares delete propio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
