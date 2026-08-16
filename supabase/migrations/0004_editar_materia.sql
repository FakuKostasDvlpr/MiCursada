-- Fase 5 — Las materias vienen del sync con Moodle: el nombre es readonly y no
-- se crean/eliminan desde la app. Esta RPC edita solo lo que Moodle no trae:
-- profe, aula, color y horarios (0 o más), en una transacción.
-- (crear_materia_con_horarios y actualizar_materia_con_horarios quedan en 0002
-- por si el sync las quiere usar; la app ya no las llama.)

-- p_horarios llega como jsonb: [{"dia": 1, "inicio": "18:30", "fin": "22:10"}, ...]
create or replace function public.editar_materia(
  p_materia_id uuid,
  p_profe text,
  p_aula text,
  p_color text,
  p_horarios jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actualizadas int;
  h jsonb;
begin
  update public.materias
  set profe = p_profe, aula = p_aula, color = p_color
  where id = p_materia_id;

  get diagnostics v_actualizadas = row_count;
  if v_actualizadas = 0 then
    raise exception 'materia no encontrada' using errcode = 'P0002';
  end if;

  -- reemplazo total: borro horarios previos e inserto los nuevos (puede ser 0)
  delete from public.horarios where materia_id = p_materia_id;

  for h in select * from jsonb_array_elements(p_horarios) loop
    insert into public.horarios (materia_id, dia, inicio, fin)
    values (
      p_materia_id,
      (h ->> 'dia')::smallint,
      (h ->> 'inicio')::time,
      (h ->> 'fin')::time
    );
  end loop;
end;
$$;

revoke execute on function public.editar_materia(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.editar_materia(uuid, text, text, text, jsonb) to authenticated;
