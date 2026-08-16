-- Fase 3 — RPCs para crear/actualizar materia + horarios en una transacción.
-- security invoker: corren como el usuario autenticado, RLS sigue aplicando.

-- horarios llega como jsonb: [{"dia": 1, "inicio": "18:30", "fin": "22:10"}, ...]

create or replace function public.crear_materia_con_horarios(
  p_nombre text,
  p_profe text,
  p_aula text,
  p_color text,
  p_horarios jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_materia_id uuid;
  h jsonb;
begin
  insert into public.materias (nombre, profe, aula, color)
  values (p_nombre, p_profe, p_aula, p_color)
  returning id into v_materia_id;

  for h in select * from jsonb_array_elements(p_horarios) loop
    insert into public.horarios (materia_id, dia, inicio, fin)
    values (
      v_materia_id,
      (h ->> 'dia')::smallint,
      (h ->> 'inicio')::time,
      (h ->> 'fin')::time
    );
  end loop;

  return v_materia_id;
end;
$$;

create or replace function public.actualizar_materia_con_horarios(
  p_materia_id uuid,
  p_nombre text,
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
  set nombre = p_nombre, profe = p_profe, aula = p_aula, color = p_color
  where id = p_materia_id;

  get diagnostics v_actualizadas = row_count;
  if v_actualizadas = 0 then
    raise exception 'materia no encontrada' using errcode = 'P0002';
  end if;

  -- reemplazo total: borro horarios previos e inserto los nuevos
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

-- p_items llega como jsonb: [{"id": "<uuid>", "orden": 1000}, ...]
-- Update en batch dentro de una transacción; RLS sigue aplicando (security invoker).
create or replace function public.reordenar_bloques(
  p_items jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.bloques b
  set orden = (i.item ->> 'orden')::int
  from jsonb_array_elements(p_items) as i(item)
  where b.id = (i.item ->> 'id')::uuid;
end;
$$;

-- Solo usuarios autenticados pueden ejecutar las RPCs.
revoke execute on function public.crear_materia_con_horarios(text, text, text, text, jsonb) from public, anon;
revoke execute on function public.actualizar_materia_con_horarios(uuid, text, text, text, text, jsonb) from public, anon;
revoke execute on function public.reordenar_bloques(jsonb) from public, anon;
grant execute on function public.crear_materia_con_horarios(text, text, text, text, jsonb) to authenticated;
grant execute on function public.actualizar_materia_con_horarios(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.reordenar_bloques(jsonb) to authenticated;
