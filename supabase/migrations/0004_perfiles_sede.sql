-- La sede es un dato real del alumno en el aula virtual (custom field "1-Sede"
-- del perfil de Moodle, con `institution` de respaldo). Se guarda al entrar y
-- al verificar el token, igual que el instituto: no se edita a mano.
--
-- El turno NO tiene columna: el aula no lo expone y se deriva de los horarios
-- reales de la persona (lib/cursada.ts turnoDesdeMaterias).

alter table public.perfiles
  add column sede text;
