// Herencia de horarios entre compañeros de la misma comisión.
//
// El aula virtual no publica horarios, así que cada persona los carga a mano.
// Pero en Moodle **cada comisión es un curso distinto**, con su propio id: dos
// personas inscriptas al mismo `curso_id` cursan literalmente juntas. O sea que
// la pertenencia a la comisión ya está en `inscripciones` y no hay que
// deducirla de ningún nombre ni shortname.
//
// De ahí sale esto: si alguien de tu curso ya cargó el horario, heredalo. Es
// mejor que una plantilla escrita a mano porque escala sola — cubre cualquier
// carrera y cualquier tramo en cuanto UNA persona de ese grupo cargue lo suyo,
// sin que nadie tenga que conocer esa grilla de antemano.

export type Franja = { dia: number; inicio: string; fin: string };
export type FilaHorario = { user_id: string; dia: number; inicio: string; fin: string };

/** Firma estable de una grilla, para poder contar cuántos comparten la misma. */
function firma(franjas: Franja[]): string {
  return franjas
    .map((f) => `${f.dia}|${f.inicio}|${f.fin}`)
    .sort()
    .join(',');
}

const ordenar = (franjas: Franja[]): Franja[] =>
  [...franjas].sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio));

/**
 * La grilla que más gente comparte en un curso, o `[]` si nadie cargó nada.
 *
 * Elige la grilla COMPLETA de la persona modal en vez de mezclar las franjas
 * más votadas de cada uno: mezclar puede armar una semana que nadie cursa
 * realmente (dos franjas que se pisan, o un día suelto de otra comisión).
 * Copiar una grilla que alguien vive de verdad es más seguro.
 *
 * Desempates, en orden: la que más personas comparten, después la que más
 * franjas tiene (una grilla completa le gana a una a medio cargar), y por
 * último la firma menor, para que el resultado sea determinístico y dos
 * llamadas seguidas no devuelvan cosas distintas.
 */
export function grillaConsensuada(filas: FilaHorario[]): Franja[] {
  if (filas.length === 0) return [];

  const porUsuario = new Map<string, Franja[]>();
  for (const f of filas) {
    const lista = porUsuario.get(f.user_id) ?? [];
    lista.push({ dia: f.dia, inicio: f.inicio, fin: f.fin });
    porUsuario.set(f.user_id, lista);
  }

  const candidatas = new Map<string, { franjas: Franja[]; votos: number }>();
  for (const franjas of porUsuario.values()) {
    if (franjas.length === 0) continue;
    const clave = firma(franjas);
    const previa = candidatas.get(clave);
    if (previa) previa.votos += 1;
    else candidatas.set(clave, { franjas: ordenar(franjas), votos: 1 });
  }
  if (candidatas.size === 0) return [];

  const [mejor] = [...candidatas.entries()].sort(
    ([claveA, a], [claveB, b]) =>
      b.votos - a.votos ||
      b.franjas.length - a.franjas.length ||
      claveA.localeCompare(claveB)
  );
  return mejor ? mejor[1].franjas : [];
}
