-- La subida del avatar fallaba con upsert: true. El upsert de Storage necesita
-- SELECT ademas de INSERT y UPDATE (chequea si el objeto ya existe antes de
-- decidir entre crear y reemplazar), y 0001 solo creo esas dos mas DELETE.
-- Sin SELECT, elegir un avatar devolvia "No se pudo subir la foto".
--
-- La lectura del archivo en si ya era publica (bucket public: true); esta
-- policy solo habilita el chequeo de existencia a quien esta autenticado.

create policy avatares_select on storage.objects for select to authenticated
  using (bucket_id = 'avatares');
