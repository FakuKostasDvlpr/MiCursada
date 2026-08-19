// Manipulación de las franjas horarias de UNA materia.
//
// Lógica pura del editor de la semana (components/armar-semana.tsx): toda
// operación devuelve un array nuevo y ordenado, así la UI nunca depende del
// orden en que se fueron tocando los controles.
//
// El horario es un overlay que carga cada persona: el aula virtual no lo
// publica (ver lib/plantilla-horarios.ts). Acá está lo que hace falta para
// acomodarlo a mano.

/** Una franja: día 1 = Lunes … 6 = Sábado, horas en 'HH:MM'. */
export type Franja = { dia: number; inicio: string; fin: string };

/**
 * Franja por defecto de una franja nueva. Casi toda la cursada nocturna va de
 * 19 a 23; los días que se parten adentro de esa ventana (Matemáticas hasta
 * 21:40, Inglés desde 21:40) se ajustan con los campos de hora.
 */
export const FRANJA_DEFECTO = { inicio: '19:00', fin: '23:00' } as const;

/** Lunes a sábado. Domingo no se cursa. */
export const DIAS_HABILES = [1, 2, 3, 4, 5, 6] as const;

const ordenar = (franjas: Franja[]): Franja[] =>
  [...franjas].sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio));

/** 'HH:MM' compara bien lexicográficamente, así que no hace falta parsear. */
export function franjaValida(inicio: string, fin: string): boolean {
  return /^\d{2}:\d{2}$/.test(inicio) && /^\d{2}:\d{2}$/.test(fin) && fin > inicio;
}

/**
 * Marca o desmarca un día entero. Es el atajo: un toque deja la materia con la
 * franja de siempre en ese día, sin tocar los campos de hora.
 *
 * Al agregar copia la franja que esa materia ya usa en otro día en vez de la
 * genérica. Si Matemáticas va 19:00–21:40 el miércoles, sumarle el lunes tiene
 * que dar 19:00–21:40 — si no, marcar un día de más te obliga a ir a
 * corregirle la hora.
 */
export function alternarDia(franjas: Franja[], dia: number): Franja[] {
  if (franjas.some((f) => f.dia === dia)) return franjas.filter((f) => f.dia !== dia);

  const previa = franjas[0];
  const base = previa
    ? { inicio: previa.inicio, fin: previa.fin }
    : { inicio: FRANJA_DEFECTO.inicio, fin: FRANJA_DEFECTO.fin };
  return ordenar([...franjas, { dia, ...base }]);
}

/**
 * Suma una franja más.
 *
 * Elige el primer día hábil que la materia todavía no usa; si ya los usa
 * todos, repite el último. Repetir día es válido a propósito: una materia
 * puede tener dos bloques el mismo día.
 */
export function agregarFranja(franjas: Franja[]): Franja[] {
  const usados = new Set(franjas.map((f) => f.dia));
  const libre = DIAS_HABILES.find((d) => !usados.has(d));
  const dia = libre ?? franjas[franjas.length - 1]?.dia ?? DIAS_HABILES[0];
  return ordenar([
    ...franjas,
    { dia, inicio: FRANJA_DEFECTO.inicio, fin: FRANJA_DEFECTO.fin },
  ]);
}

/**
 * Cambia día, inicio o fin de la franja en `indice`.
 *
 * NO reordena: mientras se está tipeando una hora, mover la fila de lugar le
 * saca el foco al input. El orden se acomoda al guardar (`ordenarFranjas`).
 */
export function editarFranja(
  franjas: Franja[],
  indice: number,
  cambios: Partial<Franja>
): Franja[] {
  return franjas.map((f, i) => (i === indice ? { ...f, ...cambios } : f));
}

/** Saca la franja en `indice`. */
export function quitarFranja(franjas: Franja[], indice: number): Franja[] {
  return franjas.filter((_, i) => i !== indice);
}

/** El orden canónico, para dejar guardado algo estable. */
export const ordenarFranjas = ordenar;

/**
 * Los días en los que dos clases se pisan.
 *
 * Cruza TODAS las materias: el choque interesante es "el miércoles anoté
 * Matemáticas y también Inglés de 19 a 23", que mirando una sola materia no se
 * ve. Es un aviso, no un bloqueo — puede haber casos raros legítimos y frenar
 * el guardado por eso sería peor que avisar.
 */
export function diasSolapados(franjas: { dia: number; inicio: string; fin: string }[]): number[] {
  const porDia = new Map<number, { inicio: string; fin: string }[]>();
  for (const f of franjas) {
    porDia.set(f.dia, [...(porDia.get(f.dia) ?? []), { inicio: f.inicio, fin: f.fin }]);
  }

  const dias: number[] = [];
  for (const [dia, lista] of porDia) {
    const orden = [...lista].sort((a, b) => a.inicio.localeCompare(b.inicio));
    const choca = orden.some((f, i) => i > 0 && f.inicio < (orden[i - 1]?.fin ?? ''));
    if (choca) dias.push(dia);
  }
  return dias.sort((a, b) => a - b);
}

// --- Horas en 24 h ---------------------------------------------------------
//
// `<input type="time">` se renderiza según el locale del NAVEGADOR: en un
// equipo en inglés, 19:00 se ve "07:00 PM". No hay atributo ni CSS que lo
// fuerce a 24 h, y el proyecto trabaja siempre en 24 h (los horarios se
// guardan y se comparan como 'HH:MM'). Por eso la hora se elige con controles
// propios — ver components/campo-hora.tsx.

/** Paso de los minutos ofrecidos. Cubre los 20/40 reales de la cursada. */
export const PASO_MINUTOS = 5;

/** '19:40' → { hora: 19, minuto: 40 }. Devuelve null si no es 'HH:MM'. */
export function partirHora(hhmm: string): { hora: number; minuto: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  if (hora > 23 || minuto > 59) return null;
  return { hora, minuto };
}

/** 19, 0 → '19:00'. Siempre con dos dígitos, siempre 24 h. */
export function componerHora(hora: number, minuto: number): string {
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return `${dosDigitos(hora)}:${dosDigitos(minuto)}`;
}

/**
 * Los minutos que ofrece el selector: los múltiplos de `PASO_MINUTOS` más el
 * valor actual si no cae en la grilla. Sin ese agregado, un horario viejo tipo
 * 19:07 se perdería al abrir el selector, porque el select no tendría su
 * opción y saltaría a otra.
 */
export function minutosOfrecidos(actual: number): number[] {
  const base: number[] = [];
  for (let m = 0; m < 60; m += PASO_MINUTOS) base.push(m);
  return base.includes(actual) ? base : [...base, actual].sort((a, b) => a - b);
}
