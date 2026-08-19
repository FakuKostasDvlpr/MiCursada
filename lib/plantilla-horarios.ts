// Grilla horaria por carrera y turno.
//
// El aula virtual NO expone horarios en ningún campo: son un overlay que cada
// persona carga a mano (ver CLAUDE.md, "Snapshot + overlays"). El efecto es
// que una cuenta recién creada sincroniza sus materias bien pero abre la app
// con "Hoy" y "Semana" vacías, porque las dos pantallas se arman iterando
// `materia.horarios` (lib/cursada.ts, app/(app)/semana/page.tsx).
//
// Esta plantilla cubre ese hueco: al sincronizar por primera vez se siembran
// los horarios que le corresponden a cada materia. Es un punto de partida
// editable, no una verdad: quien tenga otra comisión los corrige desde la
// materia y el sync nunca se los vuelve a pisar (ver `sembrarHorarios`).
//
// Deliberadamente NO se siembran profe ni aula: varían por comisión y
// afirmarlos sería inventar un dato. Solo día y franja.

/** Una franja de la grilla. `dia`: 1 = Lunes … 6 = Sábado (igual que getDay()). */
export type FranjaPlantilla = {
  /** Nombre de la materia como lo publica el aula virtual, sin el sufijo del plan. */
  materia: string;
  dia: number;
  /** HH:MM, hora de Buenos Aires. */
  inicio: string;
  fin: string;
};

/**
 * Analista en Sistemas — turno noche, Almagro, **primer tramo del plan de 2
 * años**. Extraída de la grilla real que ya estaba cargada a mano, no inventada.
 *
 * Los nombres van sin el sufijo "- Plan 2 años 2°Semestre 2026" a propósito:
 * `claveMateria` lo recorta antes de comparar, así la plantilla sobrevive al
 * cambio de semestre y de año.
 *
 * ALCANCE, medido contra los datos reales: cubre a quien cursa este set de
 * siete. NO cubre a quien va por el segundo tramo (Programación 2, Taller de
 * Programación 2, Seguridad e Integridad de Sistemas…) ni a IADS, que es otra
 * carrera entera. Esa gente sigue sin horarios sembrados —a propósito, ver
 * `horariosSembrables`— hasta que se sumen sus grillas acá.
 */
export const ANALISTA_NOCHE: FranjaPlantilla[] = [
  { materia: 'Taller de Herramientas de Programación', dia: 1, inicio: '19:00', fin: '23:00' },
  { materia: 'Fundamentos de Programación', dia: 2, inicio: '19:00', fin: '23:00' },
  { materia: 'Matemáticas', dia: 3, inicio: '19:00', fin: '21:40' },
  { materia: 'Inglés', dia: 3, inicio: '21:40', fin: '23:00' },
  { materia: 'Organización Empresarial', dia: 4, inicio: '19:00', fin: '20:20' },
  { materia: 'Introducción a la Informática', dia: 4, inicio: '20:20', fin: '21:40' },
  { materia: 'Taller de Creatividad e Innovación', dia: 4, inicio: '21:40', fin: '23:00' },
];

/**
 * Clave de comparación de un nombre de materia: sin el sufijo del plan, sin
 * acentos, sin mayúsculas y con los espacios colapsados.
 *
 * El aula publica "Matemáticas - Plan 2 años 2°Semestre 2026". Comparar el
 * nombre crudo ataría la plantilla a un semestre puntual y dejaría de matchear
 * en cuanto cambie el cuatrimestre, que es justo cuando más se la necesita.
 */
export function claveMateria(nombre: string): string {
  const sinPlan = nombre.split(/\s[-–]\s*Plan\b/i)[0] ?? nombre;
  return sinPlan
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type HorarioSembrado = {
  curso_id: string;
  dia: number;
  inicio: string;
  fin: string;
};

/**
 * Los horarios que le tocan a este set de materias según la plantilla.
 *
 * Respeta la cantidad real: una materia que no está en la plantilla no genera
 * ninguna franja (mejor sin horario que con uno inventado), y una franja de la
 * plantilla cuya materia la persona no cursa se ignora. Una misma materia
 * puede tener más de una franja en la semana.
 */
export function horariosSembrables(
  materias: { id: string; nombre: string }[],
  plantilla: FranjaPlantilla[] = ANALISTA_NOCHE
): HorarioSembrado[] {
  const porClave = new Map<string, string[]>();
  for (const m of materias) {
    const clave = claveMateria(m.nombre);
    porClave.set(clave, [...(porClave.get(clave) ?? []), m.id]);
  }

  const filas: HorarioSembrado[] = [];
  for (const franja of plantilla) {
    for (const cursoId of porClave.get(claveMateria(franja.materia)) ?? []) {
      filas.push({ curso_id: cursoId, dia: franja.dia, inicio: franja.inicio, fin: franja.fin });
    }
  }
  return filas;
}
