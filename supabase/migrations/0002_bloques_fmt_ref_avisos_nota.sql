-- Diseño del 17/08: formato y referencia por bloque, y avisos nacidos de notas.
--
-- `fmt` y `ref` son jsonb chicos y opcionales (validados por zod en la action,
-- que es la única puerta de escritura):
--   fmt = { "b": true, "i": false, "u": false, "hl": true }   (todas opcionales)
--   ref = { "tipo": "modulo" | "materia" | "aviso", "id": "…" }
--
-- `nota_id` liga un aviso manual al bloque que lo originó. Si la nota se borra,
-- el aviso queda (set null): nunca se borra en cascada — el snippet simplemente
-- deja de mostrarse, igual que en el modo local.

alter table public.bloques
  add column fmt jsonb,
  add column ref jsonb;

-- El tipo `ref` (bloque "Del curso" del diseño anterior) existe en el modo
-- local y el check original no lo incluía: se suma para que un import de
-- datos/ no reviente.
alter table public.bloques
  drop constraint bloques_tipo_check;
alter table public.bloques
  add constraint bloques_tipo_check
  check (tipo in ('texto', 'titulo', 'tarea', 'link', 'ref', 'divisor'));

alter table public.avisos_manuales
  add column nota_id uuid references public.bloques (id) on delete set null;

-- El "Ver" del modal de card busca el aviso por su nota.
create index avisos_manuales_nota_idx on public.avisos_manuales (nota_id)
  where nota_id is not null;
